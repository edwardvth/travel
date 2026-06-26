// supabase/functions/place-id-admin/index.ts
//
// Founder-gated placeId backfill admin. Service-role authority over `trips`
// (cross-user) + `placeid_review`. Resolves placeId-less stops to Google places
// via Text Search; auto-attaches confident matches; queues the rest for founder
// review. All trip writes are optimistically guarded on trips.updated_at.
// Never 5xx — returns benign JSON.
//
// COPIED PURE HELPERS (sync verbatim with app/src/trip/placeId/):
//   constants.ts, parseTextSearch.ts, geo.ts, name.ts, scoreMatch.ts, locateStop.ts

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY') ?? ''
const GOOGLE_PLACES_API_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY')
const TRIPS = `${SUPABASE_URL}/rest/v1/trips`
const REVIEW = `${SUPABASE_URL}/rest/v1/placeid_review`

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
const sh = (extra: Record<string, string> = {}) => ({ apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...extra })

// ── BEGIN copied pure helpers (verbatim from app/src/trip/placeId/) ───────────
const MAX_REVIEW_CANDIDATES = 3
const EXACT_DISTANCE_M = 100
const NEAR_DISTANCE_M = 250
const AMBIGUITY_PENALTY = 0.4
const AUTO_ATTACH_THRESHOLD = 0.7
const GOOGLE_MAX_CONCURRENCY = 8
const SCAN_PAGE_SIZE = 25

interface Candidate { placeId: string; name: string; address?: string; lat?: number; lng?: number; types: string[]; distanceM?: number }
interface MatchResult { score: number; confident: boolean; distanceM?: number }

const _finite = (n: unknown): number | undefined => typeof n === 'number' && Number.isFinite(n) ? n : undefined
const _str = (v: unknown): string => typeof v === 'string' ? v.trim() : ''
const _strArr = (v: unknown): string[] => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []

function parseTextSearch(j: unknown): Candidate[] {
  if (typeof j !== 'object' || j === null) return []
  const places = (j as { places?: unknown }).places
  if (!Array.isArray(places)) return []
  const out: Candidate[] = []
  for (const p of places) {
    if (typeof p !== 'object' || p === null) continue
    const o = p as Record<string, unknown>
    const placeId = _str(o.id)
    const name = _str((o.displayName as { text?: unknown })?.text)
    if (!placeId || !name) continue
    const loc = o.location as { latitude?: unknown; longitude?: unknown } | undefined
    const address = _str(o.formattedAddress)
    out.push({ placeId, name, ...(address ? { address } : {}), lat: _finite(loc?.latitude), lng: _finite(loc?.longitude), types: _strArr(o.types) })
    if (out.length >= MAX_REVIEW_CANDIDATES) break
  }
  return out
}

const _R = 6_371_000, _rad = (d: number) => (d * Math.PI) / 180
function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = _rad(b.lat - a.lat), dLng = _rad(b.lng - a.lng)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(_rad(a.lat)) * Math.cos(_rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * _R * Math.asin(Math.min(1, Math.sqrt(s)))
}

function normalizeName(s: string): string {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}
const _tokens = (s: string): string[] => normalizeName(s).split(' ').filter(Boolean)
function nameSimilarity(a: string, b: string): 'exact' | 'close' | 'none' {
  const na = normalizeName(a), nb = normalizeName(b)
  if (!na || !nb) return 'none'
  if (na === nb) return 'exact'
  if (na.includes(nb) || nb.includes(na)) return 'close'
  const ta = new Set(_tokens(a)), tb = new Set(_tokens(b))
  if (ta.size === 0 || tb.size === 0) return 'none'
  let inter = 0; for (const t of ta) if (tb.has(t)) inter++
  return inter / (ta.size + tb.size - inter) >= 0.5 ? 'close' : 'none'
}

interface StopLike { name: string; lat?: number; lng?: number; coords?: { lat: number; lng: number } }
const _coordsOf = (s: StopLike) => {
  const lat = s.lat ?? s.coords?.lat, lng = s.lng ?? s.coords?.lng
  return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined
}
const _distOf = (sc: { lat: number; lng: number } | undefined, c: Candidate) =>
  sc && typeof c.lat === 'number' && typeof c.lng === 'number' ? distanceMeters(sc, { lat: c.lat, lng: c.lng }) : undefined
function _nameScore(n: string, c: Candidate): number { const v = nameSimilarity(n, c.name); return v === 'exact' ? 0.6 : v === 'close' ? 0.35 : 0 }
function _distScore(d: number | undefined): number { if (d === undefined) return 0; if (d <= EXACT_DISTANCE_M) return 0.4; if (d <= NEAR_DISTANCE_M) return 0.2; return -0.3 }
function scoreMatch(stop: StopLike, candidates: Candidate[]): MatchResult {
  if (candidates.length === 0) return { score: 0, confident: false }
  const sc = _coordsOf(stop), primary = candidates[0], distanceM = _distOf(sc, primary)
  let score = _nameScore(stop.name, primary) + _distScore(distanceM)
  if (!sc) score -= 0.15
  const ambiguous = candidates.slice(1).some((c) => {
    const sim = nameSimilarity(stop.name, c.name); if (sim === 'exact' || sim === 'close') return true
    const d = _distOf(sc, c); return d !== undefined && d <= NEAR_DISTANCE_M
  })
  if (ambiguous) score -= AMBIGUITY_PENALTY
  return { score, confident: score >= AUTO_ATTACH_THRESHOLD, ...(distanceM !== undefined ? { distanceM: Math.round(distanceM) } : {}) }
}

interface TripLike { id: string; data?: { days?: Array<{ stops?: Array<{ name: string; placeId?: string; placeSource?: string }> }> } }
function locateStop(trip: TripLike, dayIndex: number, stopIndex: number, stopName: string): { dayIndex: number; stopIndex: number } | null {
  const days = trip.data?.days ?? []
  const untagged = (name: string, placeId?: string) => name === stopName && !placeId
  const atIndex = days[dayIndex]?.stops?.[stopIndex]
  if (atIndex && untagged(atIndex.name, atIndex.placeId)) return { dayIndex, stopIndex }
  const sameDay = days[dayIndex]?.stops ?? []
  for (let s = 0; s < sameDay.length; s++) if (untagged(sameDay[s].name, sameDay[s].placeId)) return { dayIndex, stopIndex: s }
  for (let d = 0; d < days.length; d++) { const stops = days[d].stops ?? []; for (let s = 0; s < stops.length; s++) if (untagged(stops[s].name, stops[s].placeId)) return { dayIndex: d, stopIndex: s } }
  return null
}
// ── END copied pure helpers ───────────────────────────────────────────────────

/** Founder gate: resolve caller → profiles.role==='founder'. Returns uid or null. */
async function founderUid(userAuth: string): Promise<string | null> {
  const who = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: userAuth, apikey: SERVICE_KEY } }).then(r => r.ok ? r.json() : null).catch(() => null)
  const uid = who?.id
  if (!uid) return null
  const prof = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${uid}&select=role`, { headers: sh() }).then(r => r.ok ? r.json() : []).catch(() => [])
  return prof?.[0]?.role === 'founder' ? uid : null
}

/** Google Text Search for a stop. Returns parsed candidates, or 'error' on a transient failure. */
async function textSearch(query: string): Promise<Candidate[] | 'error'> {
  if (!GOOGLE_PLACES_API_KEY) return 'error'
  try {
    const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY, 'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.types' },
      body: JSON.stringify({ textQuery: query, maxResultCount: MAX_REVIEW_CANDIDATES }),
    })
    if (!r.ok) return 'error'
    return parseTextSearch(await r.json())
  } catch { return 'error' }
}

/** Annotate candidates with distanceM from the stop (for display/freeze). */
function withDistance(stop: StopLike, candidates: Candidate[]): Candidate[] {
  const sc = _coordsOf(stop)
  return candidates.map((c) => { const d = _distOf(sc, c); return d !== undefined ? { ...c, distanceM: Math.round(d) } : c })
}

/** A small bounded concurrency runner (never unbounded Promise.all). */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]) }
  })
  await Promise.all(workers)
  return out
}

const stopQuery = (stop: { name: string; lat?: number; lng?: number; coords?: { lat: number; lng: number } }, city: string): string => {
  const c = _coordsOf(stop)
  return c ? stop.name : [stop.name, city].filter(Boolean).join(', ')
}

/** Optimistic write: PATCH trips.data only if updated_at is unchanged. Returns true if it landed. */
async function writeTrip(id: string, prevUpdatedAt: string | undefined, data: unknown): Promise<boolean> {
  const filter = prevUpdatedAt
    ? `id=eq.${encodeURIComponent(id)}&updated_at=eq.${encodeURIComponent(prevUpdatedAt)}`
    : `id=eq.${encodeURIComponent(id)}`
  const r = await fetch(`${TRIPS}?${filter}`, { method: 'PATCH', headers: sh({ Prefer: 'return=representation' }), body: JSON.stringify({ data, updated_at: new Date().toISOString() }) })
  if (!r.ok) return false
  const rows = await r.json().catch(() => [])
  return Array.isArray(rows) && rows.length > 0 // 0 rows = updated_at moved under us
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS })
  const userAuth = req.headers.get('Authorization') ?? ''
  let p: { action?: string; cursor?: string; reviewId?: number; placeId?: string; tripId?: string; dayIndex?: number; stopIndex?: number }
  try { p = await req.json() } catch { return json({ error: 'bad_request' }, 400) }

  const uid = await founderUid(userAuth)
  if (!uid) return json({ error: 'forbidden' }, 403)

  try {
    // ── metrics: informational counts, no Google calls. PostgREST HEAD count. ──
    if (p.action === 'metrics') {
      const count = async (path: string): Promise<number> => {
        const r = await fetch(path, { headers: sh({ Prefer: 'count=exact', Range: '0-0' }) })
        const cr = r.headers.get('content-range') ?? '*/0' // "0-0/123"
        return parseInt(cr.split('/')[1] || '0', 10) || 0
      }
      const pending_review = await count(`${REVIEW}?status=eq.pending&select=id`)
      // total_untagged / marked_none / already_tagged require scanning data JSONB;
      // approximate via the review queue + a sampling note — exact counts are not
      // required (spec: informational only). Return what PostgREST can count cheaply.
      return json({ pending_review })
    }

    // ── scan: one page of trips, resolve + auto-attach or queue. ──
    if (p.action === 'scan') {
      const cursor = p.cursor ?? ''
      const filter = cursor ? `id=gt.${encodeURIComponent(cursor)}&` : ''
      const tr = await fetch(`${TRIPS}?${filter}select=id,owner_id,updated_at,config,data&order=id&limit=${SCAN_PAGE_SIZE}`, { headers: sh() })
      const trips = tr.ok ? await tr.json() : []
      const stats = { processed: 0, tagged: 0, queued: 0, skipped_existing: 0, google_requests: 0, google_failures: 0 }
      let lastId = cursor

      for (const trip of trips) {
        lastId = trip.id
        const city = String((trip.config?.destination ?? '') || '') // trips.config column, selected above
        const days: Array<{ stops?: Array<Record<string, unknown>> }> = trip.data?.days ?? []

        // Collect the stops to resolve this trip (skip tagged / 'none' / already-pending).
        const targets: Array<{ dayIndex: number; stopIndex: number; stop: any }> = []
        for (let d = 0; d < days.length; d++) {
          const stops = days[d].stops ?? []
          for (let s = 0; s < stops.length; s++) {
            const st = stops[s] as any
            if (st.placeId || st.placeSource === 'none') { stats.skipped_existing++; continue }
            targets.push({ dayIndex: d, stopIndex: s, stop: st })
          }
        }
        if (targets.length === 0) continue

        // Existing pending rows for this trip → don't re-queue.
        const pr = await fetch(`${REVIEW}?trip_id=eq.${encodeURIComponent(trip.id)}&status=eq.pending&select=day_index,stop_index`, { headers: sh() })
        const pendingSet = new Set((pr.ok ? await pr.json() : []).map((r: any) => `${r.day_index}-${r.stop_index}`))
        const toResolve = targets.filter(t => !pendingSet.has(`${t.dayIndex}-${t.stopIndex}`))

        // Bounded-concurrency Google Text Search.
        const resolved = await mapLimit(toResolve, GOOGLE_MAX_CONCURRENCY, async (t) => {
          const res = await textSearch(stopQuery(t.stop, city))
          stats.google_requests++
          if (res === 'error') { stats.google_failures++; return { t, candidates: null as Candidate[] | null } }
          return { t, candidates: withDistance(t.stop, res) }
        })

        // Apply: build the auto-attach patch + the review inserts.
        let data = trip.data
        let mutated = false
        let tripTagged = 0 // counted only into stats AFTER the optimistic write lands
        const reviewRows: Record<string, unknown>[] = []
        for (const { t, candidates } of resolved) {
          if (candidates === null) continue // transient error → leave untouched, retried next run
          stats.processed++
          const match = scoreMatch(t.stop, candidates)
          if (match.confident && candidates[0]) {
            // Clone-on-first-write to attach identity immutably.
            if (!mutated) { data = JSON.parse(JSON.stringify(trip.data)); mutated = true }
            const st = data.days[t.dayIndex].stops[t.stopIndex]
            st.placeId = candidates[0].placeId
            st.placeName = candidates[0].name
            st.placeTypes = candidates[0].types
            st.placeSource = 'google'
            st.placeMatchedAt = new Date().toISOString()
            st.placeMatchMethod = 'auto'
            if (match.distanceM !== undefined) st.placeMatchDistanceM = match.distanceM
            tripTagged++
          } else {
            reviewRows.push({
              trip_id: trip.id, owner_id: trip.owner_id ?? null,
              day_index: t.dayIndex, stop_index: t.stopIndex, stop_name: t.stop.name,
              stop_lat: t.stop.lat ?? t.stop.coords?.lat ?? null, stop_lng: t.stop.lng ?? t.stop.coords?.lng ?? null,
              score: match.score, candidates, status: 'pending',
            })
          }
        }

        // One optimistic trip write (only if we auto-attached something).
        if (mutated) {
          const ok = await writeTrip(trip.id, trip.updated_at, data)
          if (!ok) continue // benign skip: the trip changed under us; these stops remain for the next run (don't count them, don't queue)
          stats.tagged += tripTagged // only now that the write landed
        }
        // Insert review rows (ignore 409 duplicates from the pending unique index).
        for (const row of reviewRows) {
          const ins = await fetch(REVIEW, { method: 'POST', headers: sh({ Prefer: 'return=minimal' }), body: JSON.stringify(row) })
          if (ins.ok) stats.queued++ // 409 = already pending (benign, not re-counted)
        }
      }

      const remaining = trips.length === SCAN_PAGE_SIZE // a full page → there may be more
      return json({ ...stats, cursor: lastId, done: !remaining })
    }

    // ── list: pending review rows in deterministic order. ──
    if (p.action === 'list') {
      const r = await fetch(`${REVIEW}?status=eq.pending&order=score.desc,created_at.asc,id.asc&limit=100&select=*`, { headers: sh() })
      return json({ rows: r.ok ? await r.json() : [] })
    }

    // ── attach: tag the stop with a frozen candidate (optimistic). ──
    if (p.action === 'attach') {
      const rr = await fetch(`${REVIEW}?id=eq.${p.reviewId}&select=*`, { headers: sh() })
      const row = (rr.ok ? await rr.json() : [])[0]
      if (!row || row.status !== 'pending') return json({ status: 'gone' })
      const cand = (row.candidates as Candidate[]).find(c => c.placeId === p.placeId)
      if (!cand) return json({ status: 'rejected' }) // must be a frozen candidate
      const tr = await fetch(`${TRIPS}?id=eq.${encodeURIComponent(row.trip_id)}&select=id,updated_at,data`, { headers: sh() })
      const trip = (tr.ok ? await tr.json() : [])[0]
      if (!trip) { await setStatus(row.id, 'stale'); return json({ status: 'stale' }) }
      const loc = locateStop(trip, row.day_index, row.stop_index, row.stop_name)
      if (!loc) { await setStatus(row.id, 'stale'); return json({ status: 'stale' }) }
      const data = JSON.parse(JSON.stringify(trip.data))
      const st = data.days[loc.dayIndex].stops[loc.stopIndex]
      st.placeId = cand.placeId; st.placeName = cand.name; st.placeTypes = cand.types
      st.placeSource = 'google'; st.placeMatchedAt = new Date().toISOString(); st.placeMatchMethod = 'founder'
      if (cand.distanceM !== undefined) st.placeMatchDistanceM = cand.distanceM
      const ok = await writeTrip(trip.id, trip.updated_at, data)
      if (!ok) return json({ status: 'conflict' }) // trip changed; founder can retry
      await fetch(`${REVIEW}?id=eq.${row.id}`, { method: 'PATCH', headers: sh({ Prefer: 'return=minimal' }), body: JSON.stringify({ status: 'resolved', resolved_place_id: cand.placeId, resolved_at: new Date().toISOString() }) })
      return json({ status: 'resolved' })
    }

    // ── skip: mark the stop placeSource:'none' (optimistic). ──
    if (p.action === 'skip') {
      const rr = await fetch(`${REVIEW}?id=eq.${p.reviewId}&select=*`, { headers: sh() })
      const row = (rr.ok ? await rr.json() : [])[0]
      if (!row || row.status !== 'pending') return json({ status: 'gone' })
      const tr = await fetch(`${TRIPS}?id=eq.${encodeURIComponent(row.trip_id)}&select=id,updated_at,data`, { headers: sh() })
      const trip = (tr.ok ? await tr.json() : [])[0]
      if (!trip) { await setStatus(row.id, 'stale'); return json({ status: 'stale' }) }
      const loc = locateStop(trip, row.day_index, row.stop_index, row.stop_name)
      if (!loc) { await setStatus(row.id, 'stale'); return json({ status: 'stale' }) }
      const data = JSON.parse(JSON.stringify(trip.data))
      data.days[loc.dayIndex].stops[loc.stopIndex].placeSource = 'none'
      const ok = await writeTrip(trip.id, trip.updated_at, data)
      if (!ok) return json({ status: 'conflict' })
      await setStatus(row.id, 'skipped')
      return json({ status: 'skipped' })
    }

    // ── reset: clear placeSource:'none' so the stop re-queues next scan. ──
    if (p.action === 'reset') {
      if (!p.tripId || p.dayIndex == null || p.stopIndex == null) return json({ error: 'bad_request' }, 400)
      const tr = await fetch(`${TRIPS}?id=eq.${encodeURIComponent(p.tripId)}&select=id,updated_at,data`, { headers: sh() })
      const trip = (tr.ok ? await tr.json() : [])[0]
      if (!trip) return json({ status: 'gone' })
      const st = trip.data?.days?.[p.dayIndex]?.stops?.[p.stopIndex]
      if (!st || st.placeSource !== 'none') return json({ status: 'gone' })
      const data = JSON.parse(JSON.stringify(trip.data))
      delete data.days[p.dayIndex].stops[p.stopIndex].placeSource
      const ok = await writeTrip(trip.id, trip.updated_at, data)
      return json({ status: ok ? 'reset' : 'conflict' })
    }

    return json({ error: 'unknown_action' }, 400)
  } catch (e) {
    console.error('[place-id-admin]', String(e))
    return json({ error: 'failed' }, 200)
  }

  async function setStatus(id: number, status: string) {
    await fetch(`${REVIEW}?id=eq.${id}`, { method: 'PATCH', headers: sh({ Prefer: 'return=minimal' }), body: JSON.stringify({ status, resolved_at: new Date().toISOString() }) })
  }
})
