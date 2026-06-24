// supabase/functions/enrich-place/index.ts
//
// Shared place-description cache authority. The ONLY reader/writer of place_cache
// (service role). Verifies the place via Google Place Details, claims a per-row
// lock via PostgREST (POST 409 = contention), generates via ai-proxy (founder/
// credits-gated), writes content + provenance atomically, audits. Reuses the
// shared GOOGLE_PLACES_API_KEY + service role. Never 5xx — returns
// {status:'failed'|'unsupported'} on any error.
//
// COPIED PURE HELPERS (sync with app):
//   CURRENT_ENRICH_VERSION, promptId        ← app/src/trip/placeCache/version.ts
//   validatePlaceRequest, isValidPlaceIdShape ← app/src/trip/placeCache/validate.ts
//   GEN, decideAction                        ← app/src/trip/placeCache/decide.ts
//   buildEnrichPrompt, parseStopDetail       ← app/src/trip/enrich.ts (+ deps)
//   wikiExtractUrl, parseWikiExtract         ← app/src/trip/wiki.ts (+ deps)

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY') ?? ''
const GOOGLE_PLACES_API_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY')
const REST = `${SUPABASE_URL}/rest/v1/place_cache`
const AUDIT = `${SUPABASE_URL}/rest/v1/place_cache_audit`
const AI_PROXY = `${SUPABASE_URL}/functions/v1/ai-proxy`
const CURRENT_ENRICH_VERSION = 2
const GEN = { LEASE_SECONDS: 60, FAILURE_COOLDOWN_SECONDS: 300, MAX_ATTEMPTS: 5 }
const RATE_LIMIT_PER_HOUR = 120
const rate = new Map<string, { count: number; resetAt: number }>()

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
const sh = (extra: Record<string, string> = {}) => ({ apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...extra })

function promptId(t: string): string { let h = 0x811c9dc5; for (let i=0;i<t.length;i++){h^=t.charCodeAt(i);h=Math.imul(h,0x01000193)} return (h>>>0).toString(16).padStart(8,'0') }
function isValidPlaceIdShape(p: string){ return /^[A-Za-z0-9_-]{16,}$/.test(p) }
function validatePlaceRequest(r: { placeId: string; name?: string; coords?: { lat:number; lng:number } }) {
  if(!isValidPlaceIdShape(r.placeId)) return {ok:false}; if(r.name!==undefined && r.name.trim()==='') return {ok:false}
  if(r.coords){const{lat,lng}=r.coords;const f=(n:unknown)=>typeof n==='number'&&Number.isFinite(n);if(!f(lat)||!f(lng)||lat<-90||lat>90||lng<-180||lng>180) return {ok:false}}
  return {ok:true}
}
type Row = { generation_status:string; generation_started_at:string; generation_attempts:number; content_source?:string; manual_lock?:boolean } | null
// Returns { kind } to MATCH app/src/trip/placeCache/decide.ts exactly (verbatim copy).
function decideAction(row: Row, nowMs: number): { kind: string } {
  if(!row) return { kind:'claim' }
  const age=(nowMs-Date.parse(row.generation_started_at))/1000
  switch(row.generation_status){
    case 'ready': return { kind:'serve' }
    case 'unsupported': return { kind:'unsupported' }
    case 'generating': return { kind: age>GEN.LEASE_SECONDS?'reclaim':'pending' }
    case 'failed':
      if(age<=GEN.FAILURE_COOLDOWN_SECONDS) return { kind:'failed' }
      return { kind: row.generation_attempts>=GEN.MAX_ATTEMPTS?'failed':'claim' }
  }
  return { kind:'failed' }
}

// >>> PASTED PURE HELPERS (verbatim from app sources, no external imports needed in Deno):
//
// Sources:
//   app/src/trip/wiki.ts     → WIKI_EXTRACT_SENTENCES, wikiExtractUrl, parseWikiExtract
//   app/src/trip/enrich.ts   → StopDetailContent, EnrichGrounding, StopLike (local),
//                              cleanWikiText, buildStopContext, coerceFacts,
//                              buildEnrichPrompt, parseStopDetail

// ── from app/src/trip/wiki.ts ─────────────────────────────────────────────────

/** Number of intro sentences requested from Wikipedia. */
const WIKI_EXTRACT_SENTENCES = 6

/**
 * Build the Wikipedia query URL for a plain-text intro `extract`. Uses
 * `generator=search` so a fuzzy place name still resolves to a real article,
 * `prop=extracts` with `exintro`/`explaintext` for the lead section as plain
 * text, and `exsentences` to cap length. CORS is opened with `origin=*`. The
 * query is URL-encoded.
 */
function wikiExtractUrl(query: string): string {
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: query,
    gsrlimit: '1',
    prop: 'extracts',
    exintro: '1',
    explaintext: '1',
    exsentences: String(WIKI_EXTRACT_SENTENCES),
    format: 'json',
    origin: '*',
  })
  return `https://en.wikipedia.org/w/api.php?${params.toString()}`
}

/**
 * Safely extract the first page's `extract` string from a Wikipedia query
 * response. `query.pages` is an object keyed by page id; we take the first
 * entry. Returns the trimmed extract, or null on any miss or shape error (no
 * pages, no extract, empty/non-string extract, garbage input). Mirrors
 * `parseLandmarkImage`'s defensive shape-checking.
 */
function parseWikiExtract(json: unknown): string | null {
  if (typeof json !== 'object' || json === null) return null
  const query = (json as { query?: unknown }).query
  if (typeof query !== 'object' || query === null) return null
  const pages = (query as { pages?: unknown }).pages
  if (typeof pages !== 'object' || pages === null) return null

  const first = Object.values(pages as Record<string, unknown>)[0]
  if (typeof first !== 'object' || first === null) return null
  const extract = (first as { extract?: unknown }).extract
  if (typeof extract !== 'string') return null
  const trimmed = extract.trim()
  return trimmed ? trimmed : null
}

// ── from app/src/trip/enrich.ts ──────────────────────────────────────────────

interface StopDetailContent {
  history: string
  facts: string[]
  tips: string
  notice: string
}

/** Optional grounding passed into the enrich prompt (Group E layered chain). */
interface EnrichGrounding {
  /** A plain-text Wikipedia intro extract for this place (free REST), if any. */
  source?: string
}

/**
 * Minimal Stop-like shape used by the pure helpers below. Mirrors the fields
 * actually accessed by buildStopContext / buildEnrichPrompt from
 * app/src/types.ts Stop — no browser/Node-only API references.
 */
interface StopLike {
  name: string
  type?: string
  address?: string
  lat?: number
  lng?: number
  coords?: { lat: number; lng: number }
  wikiTitle?: string
  note?: string
}

/**
 * Normalize a Wikipedia / AI plain-text extract for display or grounding:
 * collapse runs of spaces/tabs (but keep paragraph breaks), strip a couple of
 * common wiki artefacts (parenthetical pronunciation/listen markers), and trim.
 * Pure + unit-tested. Copied verbatim from app/src/trip/enrich.ts.
 */
function cleanWikiText(text: string): string {
  const raw = (text || '').trim()
  if (!raw) return ''
  return raw
    // Drop parenthetical IPA / pronunciation / listen markers that read as noise.
    .replace(/\((?:[^()]*\b(?:pronunciation|pronounced|listen|IPA|i\/)[^()]*)\)/gi, '')
    // Collapse horizontal whitespace runs without flattening paragraph breaks.
    .replace(/[^\S\n]+/g, ' ')
    // Collapse 3+ newlines to a paragraph break.
    .replace(/\n{3,}/g, '\n\n')
    .replace(/ *\n */g, '\n')
    .trim()
}

/**
 * Build a compact "what we already know" block from metadata already on the
 * stop — `type`, `address`, coords (`lat`/`lng` or nested `coords`), `note`, and
 * any cached `wikiTitle`. No external calls. Returns an empty string when the
 * stop carries nothing useful. Pure + unit-tested.
 * Copied verbatim from app/src/trip/enrich.ts (uses StopLike instead of Stop).
 */
function buildStopContext(stop: StopLike): string {
  const lines: string[] = []
  if (stop.type) lines.push(`Type: ${stop.type}`)
  if (stop.address) lines.push(`Address: ${stop.address}`)
  const lat = stop.lat ?? stop.coords?.lat
  const lng = stop.lng ?? stop.coords?.lng
  if (lat != null && lng != null) lines.push(`Coordinates: ${lat}, ${lng}`)
  if (stop.wikiTitle) lines.push(`Wikipedia article: ${stop.wikiTitle}`)
  if (stop.note) lines.push(`Traveller note: ${stop.note}`)
  return lines.join('\n')
}

/**
 * Build the enrich prompt for a stop. Copied verbatim from app/src/trip/enrich.ts
 * (uses StopLike instead of Stop).
 */
function buildEnrichPrompt(
  stop: StopLike,
  tripTitle: string,
  destination = '',
  grounding: EnrichGrounding = {},
): string {
  const placeRef = [stop.name, stop.address].filter(Boolean).join(', ') || stop.name
  const typeHint = stop.type ? ` (a ${stop.type})` : ''
  const cityHint = destination ? ` in ${destination}` : ''
  const tripHint = tripTitle ? ` It's a stop on a trip titled "${tripTitle}".` : ''
  const coordHint =
    stop.lat != null && stop.lng != null
      ? ` The exact location is GPS ${(+stop.lat).toFixed(5)}, ${(+stop.lng).toFixed(5)} — describe the specific place at these coordinates, not a similarly named place elsewhere.`
      : ''

  const source = (grounding.source || '').trim()
  const context = buildStopContext(stop)
  const sourceBlock = source
    ? `\n\nSOURCE MATERIAL (from Wikipedia — treat as authoritative facts):\n"""\n${source}\n"""`
    : ''
  const contextBlock = context ? `\n\nWHAT WE ALREADY KNOW ABOUT THIS STOP:\n${context}` : ''

  return `You are an expert, engaging tour guide. Write rich, accurate content for "${placeRef}"${typeHint}${cityHint}.${tripHint}${coordHint}${sourceBlock}${contextBlock}

Write three sections for this place:
- "history" = Story: why this place matters — its significance, character, and the story behind it (2-3 short plain-text paragraphs).
- "facts" = Interesting Facts: an array of 2-4 short, standalone FACTUAL details — dates, architecture, history, or little-known trivia that are simply true about the place. These are facts, not advice; visiting/experience tips do NOT belong here.
- "tips" = Experience: how to actually experience it on the ground — the best time of day or season to come, what to look for, the atmosphere, where to stand, what to do nearby. Write 1-3 sentences of genuinely useful, evocative guidance. Almost every place warrants this — write it.

SECTION DISCIPLINE: keep "facts" purely factual and "tips" purely experiential. If a detail is about visiting or experiencing the place (e.g. "visit on a warm summer evening"), it belongs in Experience, NOT in Interesting Facts. Never drop a useful detail — move it to the right section rather than omitting it.

GROUNDING RULES (accuracy over completeness):
- For "history" and "facts": use ONLY the source material above plus well-established, widely-known public knowledge about this exact place. Do NOT invent specifics — no made-up dates, names, numbers, or events. If you are not sure, leave it out; return an EMPTY string (or [] for "facts") rather than fabricate.
- For "tips"/Experience: you may draw on the place's type and character for practical, evocative advice, but still do NOT invent specific facts (named events, exact figures).

CRITICAL: Respond with ONLY valid JSON starting with { and ending with }. No markdown, no code fences, no preamble.

{"history":"Story — why it matters, plain-text paragraphs separated by \\n\\n (or empty).","facts":["interesting factual detail with a date or number","little-known true detail"],"tips":"Experience — how to experience it on the ground: best time, what to look for, the atmosphere."}`
}

/** Coerce an unknown `facts` value into a clean string array (legacy guards against a bare string).
 * Copied verbatim from app/src/trip/enrich.ts. */
function coerceFacts(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(v => String(v).trim()).filter(Boolean)
  }
  if (typeof value === 'string') {
    const s = value.trim()
    if (!s) return []
    // A single string may itself be a list (split on common separators / lines).
    const parts = s.split(/\n+|\s*[|•]\s*/).map(p => p.replace(/^[-*\d.)\s]+/, '').trim()).filter(Boolean)
    return parts.length > 1 ? parts : [s]
  }
  return []
}

/**
 * Parse the model's text into `{ history, facts[], tips }`. Robust to code
 * fences and preamble: strips ```json fences, slices the first `{` to the last
 * `}`, and JSON.parses. Falls back to treating the raw text as the history when
 * no JSON is present. Always returns the right shape (facts coerced to array).
 * Copied verbatim from app/src/trip/enrich.ts.
 */
function parseStopDetail(text: string): StopDetailContent {
  const fallback: StopDetailContent = { history: '', facts: [], tips: '', notice: '' }
  const raw = (text || '').trim()
  if (!raw) return fallback

  let candidate = raw.replace(/```json|```/g, '').trim()
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start >= 0 && end > start) {
    candidate = candidate.slice(start, end + 1)
    try {
      const info = JSON.parse(candidate) as Record<string, unknown>
      return {
        history: typeof info.history === 'string' ? info.history.trim() : '',
        facts: coerceFacts(info.facts),
        tips: typeof info.tips === 'string' ? info.tips.trim() : '',
        notice: typeof info.notice === 'string' ? info.notice.trim() : '',
      }
    } catch {
      /* fall through to plain-text handling */
    }
  }

  // No usable JSON — use the plain text as history so we never show blank.
  return { history: raw, facts: [], tips: '', notice: '' }
}

// ── end pasted helpers ────────────────────────────────────────────────────────

function ok(ip: string){ const n=Date.now(); const e=rate.get(ip); if(!e||n>e.resetAt){rate.set(ip,{count:1,resetAt:n+3600_000});return true} if(e.count>=RATE_LIMIT_PER_HOUR) return false; e.count++; return true }

/** Pick the served row: a manual_lock row wins (any version), else current version. */
async function readRow(placeId: string): Promise<{ row: Row; isManualLock: boolean }> {
  const r = await fetch(`${REST}?place_id=eq.${encodeURIComponent(placeId)}&order=manual_lock.desc,prompt_version.desc`, { headers: sh() })
  const rows = r.ok ? await r.json() : []
  const manual = rows.find((x: { manual_lock?: boolean }) => x.manual_lock)
  if (manual) return { row: manual, isManualLock: true }
  const cur = rows.find((x: { prompt_version: number }) => x.prompt_version === CURRENT_ENRICH_VERSION)
  return { row: cur ?? null, isManualLock: false }
}
const content = (row: { history?: string; facts?: string[]; tips?: string; notice?: string }) =>
  ({ history: row.history ?? '', facts: row.facts ?? [], tips: row.tips ?? '', notice: row.notice ?? '' })

/** Google Place Details: verify existence + canonical metadata, or null (not found), or 'error'. */
async function placeDetails(placeId: string): Promise<Record<string, unknown> | null | 'error'> {
  if (!GOOGLE_PLACES_API_KEY) return 'error'
  try {
    const r = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
      headers: { 'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY, 'X-Goog-FieldMask': 'displayName,formattedAddress,location,types,addressComponents' },
    })
    if (r.status === 404) return null
    if (!r.ok) return 'error'
    return await r.json()
  } catch { return 'error' }
}

async function audit(placeId: string, action: string, actor: string, extra: Record<string, unknown> = {}) {
  try { await fetch(AUDIT, { method: 'POST', headers: sh({ Prefer: 'return=minimal' }), body: JSON.stringify({ place_id: placeId, prompt_version: CURRENT_ENRICH_VERSION, action, actor, ...extra }) }) } catch { /* best effort */ }
}

/** Generate + atomically finalize. Caller already owns the lock row. */
async function generate(placeId: string, det: Record<string, unknown>, userAuth: string, actor: string): Promise<{ status: string; content?: unknown }> {
  const name = (det.displayName as { text?: string })?.text ?? ''
  const loc = det.location as { latitude?: number; longitude?: number } | undefined
  const addr = (det.formattedAddress as string) ?? ''
  const wiki = await fetch(wikiExtractUrl(`${name}, ${addr}`)).then(r => r.ok ? r.json() : null).catch(() => null)
  const source = parseWikiExtract(wiki) ?? ''
  const prompt = buildEnrichPrompt({ name, address: addr, lat: loc?.latitude, lng: loc?.longitude } as never, '', addr, { source })
  const aiRes = await fetch(AI_PROXY, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: userAuth }, body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], max_tokens: 700 }) })
  if (!aiRes.ok) {
    await fetch(`${REST}?place_id=eq.${encodeURIComponent(placeId)}&prompt_version=eq.${CURRENT_ENRICH_VERSION}`, { method: 'PATCH', headers: sh({ Prefer: 'return=minimal' }), body: JSON.stringify({ generation_status: 'failed', generation_error: `ai_${aiRes.status}`, updated_at: new Date().toISOString() }) })
    return { status: 'failed' }
  }
  const text = ((await aiRes.json()).content?.[0]?.text) ?? ''
  const parsed = parseStopDetail(text)
  const now = new Date().toISOString()
  // TODO(drift): compare det metadata vs a prior entry and set is_stale on other versions (deferred per spec).
  await fetch(`${REST}?place_id=eq.${encodeURIComponent(placeId)}&prompt_version=eq.${CURRENT_ENRICH_VERSION}`, { method: 'PATCH', headers: sh({ Prefer: 'return=minimal' }), body: JSON.stringify({
    generation_status: 'ready', prompt_id: promptId(prompt), model: 'claude-sonnet-4-6',
    history: parsed.history, facts: parsed.facts, tips: parsed.tips, notice: parsed.notice, source,
    place_name: name, address: addr, lat: loc?.latitude, lng: loc?.longitude, place_types: det.types ?? [],
    generated_at: now, updated_at: now, last_verified_at: now, content_source: 'generated', generation_error: null,
  }) })
  await audit(placeId, 'generate', actor, { model: 'claude-sonnet-4-6', prompt_id: promptId(prompt) })
  return { status: 'ready', content: parsed }
}

async function upsertUnsupported(placeId: string) {
  const now = new Date().toISOString()
  await fetch(REST, { method: 'POST', headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ place_id: placeId, prompt_version: CURRENT_ENRICH_VERSION, generation_status: 'unsupported', generation_started_at: now, updated_at: now, last_verified_at: now }) })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS })
  const userAuth = req.headers.get('Authorization') ?? ''
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  let p: { action?: string; placeId?: string; placeIds?: string[]; name?: string; coords?: { lat: number; lng: number }; force?: boolean }
  try { p = await req.json() } catch { return json({ status: 'failed' }) }

  try {
    if (p.action === 'getBatch') {
      const ids = (p.placeIds ?? []).filter(isValidPlaceIdShape).slice(0, 50)
      if (ids.length === 0) return json({ results: {} })
      const inList = ids.map(encodeURIComponent).join(',')
      const r = await fetch(`${REST}?place_id=in.(${inList})&generation_status=eq.ready&or=(manual_lock.eq.true,prompt_version.eq.${CURRENT_ENRICH_VERSION})`, { headers: sh() })
      const rows = r.ok ? await r.json() : []
      const results: Record<string, unknown> = {}
      for (const row of rows) if (!results[row.place_id] || row.manual_lock) results[row.place_id] = content(row)
      return json({ results })
    }

    const placeId = p.placeId ?? ''
    if (!validatePlaceRequest({ placeId, name: p.name, coords: p.coords }).ok) return json({ status: 'failed' })

    if (p.action === 'regenerate') {
      const who = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: userAuth, apikey: SERVICE_KEY } }).then(r => r.ok ? r.json() : null).catch(() => null)
      const uid = who?.id
      if (!uid) return json({ status: 'failed' }, 401)
      const prof = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${uid}&select=role`, { headers: sh() }).then(r => r.ok ? r.json() : []).catch(() => [])
      if (prof?.[0]?.role !== 'founder') return json({ status: 'failed' }, 403)
      if (!ok(ip)) return json({ status: 'failed' }, 429)
      const { row, isManualLock } = await readRow(placeId)
      if (isManualLock && !p.force) return json({ status: 'ready', content: content(row as Record<string, unknown>) })
      const det = await placeDetails(placeId)
      if (det === null) { await upsertUnsupported(placeId); return json({ status: 'unsupported' }) }
      if (det === 'error') return json({ status: 'failed' })
      await fetch(REST, { method: 'POST', headers: sh({ Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify({ place_id: placeId, prompt_version: CURRENT_ENRICH_VERSION, generation_status: 'generating', generation_started_at: new Date().toISOString(), generation_attempts: 1, content_source: 'generated', manual_lock: false, supersedes_version: (row as { prompt_version?: number })?.prompt_version ?? null }) })
      const out = await generate(placeId, det as Record<string, unknown>, userAuth, uid)
      await audit(placeId, 'regenerate', uid)
      return json(out)
    }

    const { row, isManualLock } = await readRow(placeId)
    const action = decideAction(row as Row, Date.now())
    if (action.kind === 'serve' || (isManualLock && row)) return json({ status: 'ready', content: content(row as Record<string, unknown>) })
    if (action.kind === 'unsupported') return json({ status: 'unsupported' })
    if (action.kind === 'pending') return json({ status: 'pending' })
    if (action.kind === 'failed') return json({ status: 'failed' })
    if (!ok(ip)) return json({ status: 'pending' })

    const det = await placeDetails(placeId)
    if (det === null) { await upsertUnsupported(placeId); return json({ status: 'unsupported' }) }
    if (det === 'error') return json({ status: 'failed' })

    if (action.kind === 'reclaim') {
      const re = await fetch(`${REST}?place_id=eq.${encodeURIComponent(placeId)}&prompt_version=eq.${CURRENT_ENRICH_VERSION}&generation_status=eq.generating&generation_started_at=lt.${new Date(Date.now() - GEN.LEASE_SECONDS*1000).toISOString()}`, { method: 'PATCH', headers: sh({ Prefer: 'return=representation' }), body: JSON.stringify({ generation_started_at: new Date().toISOString(), generation_attempts: ((row as { generation_attempts?: number })?.generation_attempts ?? 1) + 1 }) })
      const got = re.ok ? await re.json() : []
      if (!got.length) return json({ status: 'pending' })
    } else {
      const ins = await fetch(REST, { method: 'POST', headers: sh({ Prefer: 'return=minimal' }), body: JSON.stringify({ place_id: placeId, prompt_version: CURRENT_ENRICH_VERSION, generation_status: 'generating', generation_started_at: new Date().toISOString(), generation_attempts: 1 }) })
      if (ins.status === 409) return json({ status: 'pending' })
      if (!ins.ok) return json({ status: 'failed' })
    }
    const who = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: userAuth, apikey: SERVICE_KEY } }).then(r => r.ok ? r.json() : null).catch(() => null)
    return json(await generate(placeId, det as Record<string, unknown>, userAuth, who?.id ?? 'system'))
  } catch (e) {
    console.error('[enrich-place]', String(e))
    return json({ status: 'failed' })
  }
})
