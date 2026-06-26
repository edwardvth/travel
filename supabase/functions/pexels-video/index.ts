// supabase/functions/pexels-video/index.ts
//
// Destination hero VIDEO source: Pexels Video Search (proxied), with a shared
// global link cache. The Pexels API key lives ONLY here, server-side.
//
// The client POSTs `{ city, country? }`; this returns `{ url, poster }` — a
// hotlinkable Pexels CDN .mp4 + a preview poster — or `{ url: null }` so the
// client falls back to the built-in girl-walking clip.
//
// ADAPTIVE QUERY: searches the CITY first; if the city's BEST clip isn't good
// enough (low score / no usable clip) it re-searches the COUNTRY and keeps the
// country clip only if it scores meaningfully better. So "Los Angeles" stays LA,
// but "Yerevan" (thin) escalates to "Armenia".
//
// CACHE (`video_cache`, service-role only — docs/supabase/video-cache.sql):
//   * keyed by a NORMALIZED "city|country" so ambiguous cities don't collide
//     (paris|france vs paris|usa);
//   * the COUNTRY result is also cached under a country key so every sparse city
//     in that country reuses it (Armenia fetched once);
//   * `resolved_query` records provenance; a soft TTL (~180d) lets new Pexels
//     footage eventually win.
//
// GRACEFUL: no key / no table / any error → 200 `{ url: cached|null }`, never 500.
//
// DEPLOY:  supabase functions deploy pexels-video
// SECRET:  supabase secrets set PEXELS_API_KEY=<your Pexels API key>
// (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are auto-injected — no setup.)
// NOTE: no in-app rate limiter — it's ineffective across stateless Edge
// instances; the cache makes Pexels calls rare and platform limits apply.

const PEXELS_API_KEY = Deno.env.get('PEXELS_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  Deno.env.get('SERVICE_ROLE_KEY') ??
  ''

const MIN_DURATION = 6
const MIN_GOOD_SCORE = 2.5      // city must reach this, else escalate to country
const COUNTRY_MARGIN = 1.0      // country must beat the city by this to win
const TTL_MS = 180 * 24 * 3600_000 // soft TTL: re-resolve cache rows older than ~180d
// Pexels serves its video files from this CDN host. We refuse to cache/return
// anything else (defence against malformed/unexpected payloads).
const ALLOWED_HOST_SUFFIX = '.pexels.com'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, cache?: 'HIT' | 'MISS') => {
  const headers: Record<string, string> = { ...CORS, 'Content-Type': 'application/json' }
  if (cache) headers['X-Cache'] = cache
  return new Response(JSON.stringify(body), { headers })
}

/** Aggressive normalization so 'New York', ' new york', 'São Paulo' don't dup. */
function normalize(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip accents (combining diacritical marks)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')     // punctuation → space
    .replace(/\s+/g, ' ')
    .trim()
}

/** Only ever cache/return URLs from the Pexels CDN. */
function validHost(url: string): boolean {
  try {
    const h = new URL(url).hostname
    return h === 'pexels.com' || h.endsWith(ALLOWED_HOST_SUFFIX)
  } catch {
    return false
  }
}

// --- video_cache table access (service role; bypasses RLS) ----------------
function dbHeaders(extra: Record<string, string> = {}) {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...extra }
}

interface CacheRow { url: string; poster: string | null }

/** Fresh, valid cached row for `key`, or null (miss / stale / bad host / error). */
async function cacheGet(key: string): Promise<CacheRow | null> {
  if (!SERVICE_KEY || !SUPABASE_URL) return null
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/video_cache?query_key=eq.${encodeURIComponent(key)}&select=url,poster,created_at&limit=1`,
      { headers: dbHeaders() },
    )
    if (!r.ok) return null
    const rows = (await r.json().catch(() => null)) as Array<{ url?: string; poster?: string; created_at?: string }> | null
    const row = rows?.[0]
    if (!row || typeof row.url !== 'string' || !row.url || !validHost(row.url)) return null
    if (row.created_at && Date.now() - new Date(row.created_at).getTime() > TTL_MS) return null // stale → re-resolve
    return { url: row.url, poster: typeof row.poster === 'string' ? row.poster : null }
  } catch {
    return null
  }
}

/** Upsert a resolved clip (logs unexpected DB responses so misses aren't silent). */
async function cachePut(key: string, url: string, poster: string | null, resolvedQuery: string): Promise<void> {
  if (!SERVICE_KEY || !SUPABASE_URL) return
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/video_cache`, {
      method: 'POST',
      headers: dbHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({ query_key: key, url, poster, resolved_query: resolvedQuery }),
    })
    if (!r.ok && r.status !== 409) {
      console.error(`[pexels-video] cache write ${r.status}: ${await r.text().catch(() => '')}`)
    }
  } catch (e) {
    console.error(`[pexels-video] cache write error: ${String(e)}`)
  }
}

interface PexelsFile { link?: string; quality?: string; width?: number; height?: number; file_type?: string }
interface PexelsVideo { duration?: number; width?: number; height?: number; image?: string; video_files?: PexelsFile[] }

/** Best landscape MP4 (≥16:9-ish, ~720–1080p; never 4K — too heavy to stream). */
function bestFile(v: PexelsVideo): { link: string; height: number } | null {
  const files = (v.video_files ?? []).filter((f) => {
    const w = f.width ?? 0, h = f.height ?? 0
    return f.file_type === 'video/mp4' && h >= 540 && h <= 1300 && w / Math.max(h, 1) >= 1.6
  })
  if (!files.length) return null
  // Prefer exactly 1080p, then closest to 1080.
  files.sort((a, b) => Math.abs((a.height ?? 0) - 1080) - Math.abs((b.height ?? 0) - 1080))
  const f = files[0]
  return f.link && validHost(f.link) ? { link: f.link, height: f.height ?? 0 } : null
}

/** Heuristic quality score (Pexels has no likes/views). */
function score(v: PexelsVideo, idx: number, fileHeight: number): number {
  let s = 0
  if (fileHeight >= 1080) s += 3
  else if (fileHeight >= 720) s += 1
  const d = v.duration ?? 0
  if (d >= 10 && d <= 30) s += 2          // cinematic sweet spot
  else if (d >= MIN_DURATION) s += 1
  const aspect = (v.width ?? 16) / (v.height ?? 9)
  s -= Math.abs(aspect - 16 / 9) * 2.5     // favour true 16:9
  s -= idx * 0.15                          // mild relevance tiebreak
  return s
}

/** Search Pexels videos for `query`; returns the highest-scoring usable clip. */
async function searchPexels(query: string): Promise<{ url: string | null; poster: string | null; score: number }> {
  try {
    const url =
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=landscape&per_page=20`
    const r = await fetch(url, { headers: { Authorization: PEXELS_API_KEY! } })
    if (!r.ok) { console.error(`[pexels-video] search ${r.status}: ${await r.text().catch(() => '')}`); return { url: null, poster: null, score: -Infinity } }
    const data = (await r.json().catch(() => null)) as { videos?: PexelsVideo[] } | null
    let best: { s: number; url: string; poster: string | null } | null = null
    ;(data?.videos ?? []).forEach((v, idx) => {
      if ((v.duration ?? 0) < MIN_DURATION) return
      const f = bestFile(v)
      if (!f) return
      const s = score(v, idx, f.height)
      if (!best || s > best.s) best = { s, url: f.link, poster: typeof v.image === 'string' ? v.image : null }
    })
    return best ? { url: best.url, poster: best.poster, score: best.s } : { url: null, poster: null, score: -Infinity }
  } catch (e) {
    console.error(`[pexels-video] error: ${String(e)}`)
    return { url: null, poster: null, score: -Infinity }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS })

  let body: { city?: string; country?: string }
  try { body = await req.json() } catch { return json({ url: null }) }
  const city = (body.city ?? '').slice(0, 120)
  const country = (body.country ?? '').slice(0, 120)
  const nCity = normalize(city)
  const nCountry = normalize(country)
  if (!nCity) return json({ url: null })

  const key = `${nCity}|${nCountry}`
  const countryKey = nCountry ? `~|${nCountry}` : '' // shared per-country entry

  // Cache hit (fresh) → no Pexels call.
  const hit = await cacheGet(key)
  if (hit) return json(hit, 'HIT')

  if (!PEXELS_API_KEY) return json({ url: null })

  // Try the city; escalate to the country only if the city is weak.
  const cityRes = await searchPexels(city)
  let chosen = cityRes
  let resolved = city

  if (!cityRes.url || cityRes.score < MIN_GOOD_SCORE) {
    if (nCountry && nCountry !== nCity) {
      // Reuse a cached country clip if we already resolved this country before.
      const countryHit = countryKey ? await cacheGet(countryKey) : null
      const countryRes = countryHit
        ? { url: countryHit.url, poster: countryHit.poster, score: MIN_GOOD_SCORE + COUNTRY_MARGIN + 1 }
        : await searchPexels(country)
      if (countryRes.url && (!cityRes.url || countryRes.score > cityRes.score + COUNTRY_MARGIN)) {
        chosen = countryRes
        resolved = country
        if (countryKey && !countryHit && validHost(countryRes.url)) {
          await cachePut(countryKey, countryRes.url, countryRes.poster, country)
        }
      }
    }
  }

  if (chosen.url && validHost(chosen.url)) {
    await cachePut(key, chosen.url, chosen.poster, resolved)
    return json({ url: chosen.url, poster: chosen.poster }, 'MISS')
  }
  return json({ url: null }, 'MISS')
})
