// supabase/functions/pexels-video/index.ts
//
// Destination hero VIDEO source: Pexels Video Search (proxied), globally cached.
// The Pexels API key lives ONLY here, server-side.
//
// Client POSTs `{ city, country? }` (with the user's Supabase JWT) → returns
// `{ url, poster, credit }` (hotlinkable Pexels .mp4 + poster + attribution) or
// `{ url: null }` so the client falls back to the built-in girl-walking clip.
//
// ADAPTIVE: searches `"city country"` first (disambiguates Paris/Springfield/…);
// if the best clip is weak it re-searches the COUNTRY and keeps it only if it
// scores meaningfully better. So "Los Angeles" stays LA, "Yerevan" → "Armenia".
//
// CACHE (`video_cache`, service-role only — docs/supabase/video-cache.sql):
//   * normalized "city|country" key (no ambiguous-city collisions);
//   * the COUNTRY clip is also cached under a country key (sibling cities reuse it);
//   * stores the chosen clip's SCORE (cached country competes fairly) + attribution;
//   * soft TTL via `updated_at` (~180d) — and we bump updated_at on every upsert so
//     refreshed rows aren't seen as stale forever.
//
// RESILIENCE: a STALE cached clip is served if a live Pexels call fails (outage).
// ABUSE: requires an authenticated Supabase user (role=authenticated) so the
//   public endpoint can't be spammed to burn the Pexels quota. All network calls
//   have timeouts. Any error → 200 `{ url: null }`, never 500.
//
// DEPLOY:  supabase functions deploy pexels-video
// SECRET:  supabase secrets set PEXELS_API_KEY=<your Pexels API key>
// NOTE: video endpoint is `https://api.pexels.com/videos/search` — verify against
//   current Pexels docs if it ever starts 404ing.

const PEXELS_API_KEY = Deno.env.get('PEXELS_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY') ?? ''

const MIN_DURATION = 4
const MIN_GOOD_SCORE = 2.5
const COUNTRY_MARGIN = 1.0
const TTL_MS = 180 * 24 * 3600_000
const DB_TIMEOUT = 1500
const PEXELS_TIMEOUT = 4500

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, cache?: 'HIT' | 'MISS' | 'STALE') => {
  const headers: Record<string, string> = { ...CORS, 'Content-Type': 'application/json' }
  if (cache) headers['X-Cache'] = cache
  return new Response(JSON.stringify(body), { headers })
}

async function fetchT(url: string, init: RequestInit = {}, ms = 4000): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try { return await fetch(url, { ...init, signal: ctrl.signal }) } finally { clearTimeout(t) }
}

/** NFKD accent-fold + punctuation→space + collapse, so 'São Paulo' === 'sao paulo'. */
function normalize(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Pexels serves video files from player.vimeo.com (and sometimes *.pexels.com). */
function validVideoUrl(url: string): boolean {
  try { const u = new URL(url); return u.protocol === 'https:' && (u.hostname === 'player.vimeo.com' || u.hostname.endsWith('.pexels.com')) } catch { return false }
}
/** Posters live on images.pexels.com. Returns the url if valid, else null. */
function validPoster(url: string | null): string | null {
  if (!url) return null
  try { const u = new URL(url); return u.protocol === 'https:' && u.hostname.endsWith('.pexels.com') ? url : null } catch { return null }
}

/**
 * Require an authenticated Supabase USER (role=authenticated), not anon.
 * Decodes the JWT claims WITHOUT verifying the signature — that's safe ONLY
 * because the function is deployed with Supabase's platform `verify_jwt` ENABLED
 * (the default), which validates the signature before we ever run. So: deploy
 * normally (do NOT pass --no-verify-jwt). Platform proves the token is genuine;
 * this check proves it's a real user (the public anon key has role 'anon').
 */
function isAuthed(req: Request): boolean {
  const m = (req.headers.get('Authorization') ?? '').match(/^Bearer (.+)$/)
  if (!m) return false
  try {
    const p = JSON.parse(atob(m[1].split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return p?.role === 'authenticated' && !!p?.sub
  } catch { return false }
}

// --- video_cache (service role; bypasses RLS) ------------------------------
interface Credit { pexelsUrl: string | null; name: string | null; url: string | null }
interface Resolved { url: string; poster: string | null; score: number; credit: Credit }

function dbHeaders(extra: Record<string, string> = {}) {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...extra }
}

async function cacheGet(key: string): Promise<(Resolved & { stale: boolean }) | null> {
  if (!SERVICE_KEY || !SUPABASE_URL) return null
  try {
    const r = await fetchT(
      `${SUPABASE_URL}/rest/v1/video_cache?query_key=eq.${encodeURIComponent(key)}&select=url,poster,score,pexels_url,photographer_name,photographer_url,updated_at&limit=1`,
      { headers: dbHeaders() }, DB_TIMEOUT,
    )
    if (!r.ok) return null
    const row = ((await r.json().catch(() => null)) as Array<Record<string, unknown>> | null)?.[0]
    if (!row || typeof row.url !== 'string' || !validVideoUrl(row.url)) return null
    const stale = typeof row.updated_at === 'string' && Date.now() - new Date(row.updated_at).getTime() > TTL_MS
    return {
      url: row.url,
      poster: validPoster(typeof row.poster === 'string' ? row.poster : null),
      score: typeof row.score === 'number' ? row.score : MIN_GOOD_SCORE,
      credit: {
        pexelsUrl: typeof row.pexels_url === 'string' ? row.pexels_url : null,
        name: typeof row.photographer_name === 'string' ? row.photographer_name : null,
        url: typeof row.photographer_url === 'string' ? row.photographer_url : null,
      },
      stale,
    }
  } catch { return null }
}

async function cachePut(key: string, res: Resolved, resolvedQuery: string, level: 'city' | 'country'): Promise<void> {
  if (!SERVICE_KEY || !SUPABASE_URL) return
  try {
    const r = await fetchT(`${SUPABASE_URL}/rest/v1/video_cache`, {
      method: 'POST',
      headers: dbHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({
        query_key: key, url: res.url, poster: res.poster, score: res.score,
        resolved_query: resolvedQuery, resolved_level: level,
        pexels_url: res.credit.pexelsUrl, photographer_name: res.credit.name, photographer_url: res.credit.url,
        updated_at: new Date().toISOString(),
      }),
    }, DB_TIMEOUT)
    if (!r.ok && r.status !== 409) console.error(`[pexels-video] cache write ${r.status}: ${await r.text().catch(() => '')}`)
  } catch (e) { console.error(`[pexels-video] cache write error: ${String(e)}`) }
}

// --- Pexels ----------------------------------------------------------------
interface PexelsFile { link?: string; width?: number; height?: number; file_type?: string }
interface PexelsVideo { id?: number; url?: string; duration?: number; image?: string; user?: { name?: string; url?: string }; video_files?: PexelsFile[] }

function bestFile(v: PexelsVideo): { link: string; width: number; height: number } | null {
  // Permissive: any landscape-ish mp4 ≥360p. Scoring (below) prefers good ones;
  // we'd rather show a decent clip than fall back to the generic walking video.
  const files = (v.video_files ?? []).filter((f) => {
    const w = f.width ?? 0, h = f.height ?? 0
    return f.file_type === 'video/mp4' && w > h && h >= 360 && w / Math.max(h, 1) >= 1.3 && (f.link ? validVideoUrl(f.link) : false)
  })
  if (!files.length) return null
  // Prefer ~1080p; 4K (>1300p) is allowed but penalized (heavy to stream).
  const pen = (f: PexelsFile) => { const h = f.height ?? 0; return (h > 1300 ? 400 : 0) + Math.abs(h - 1080) }
  files.sort((a, b) => pen(a) - pen(b))
  const f = files[0]
  return { link: f.link!, width: f.width ?? 0, height: f.height ?? 0 }
}

function score(v: PexelsVideo, file: { width: number; height: number }): number {
  let s = 0
  if (file.height >= 1080) s += 3
  else if (file.height >= 720) s += 1
  const d = v.duration ?? 0
  if (d >= 10 && d <= 30) s += 2
  else if (d >= MIN_DURATION) s += 1
  s -= Math.abs(file.width / Math.max(file.height, 1) - 16 / 9) * 2.5
  // Source production quality. Pexels exposes NO likes/views, and its result
  // ORDER is relevance (not quality) — so we deliberately do NOT bias by index
  // (that bias used to hand the first result an unearned edge). Instead reward a
  // high NATIVE resolution: a 4K/1440p source is usually a higher-production clip
  // even when we stream its 1080p file.
  const nativeH = v.height ?? 0
  if (nativeH >= 2160) s += 1.5
  else if (nativeH >= 1440) s += 0.75
  return s
}

async function searchPexels(query: string): Promise<Resolved | null> {
  try {
    const r = await fetchT(
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=landscape&per_page=20`,
      { headers: { Authorization: PEXELS_API_KEY! } }, PEXELS_TIMEOUT,
    )
    if (!r.ok) { console.error(`[pexels-video] search ${r.status}: ${await r.text().catch(() => '')}`); return null }
    const videos = ((await r.json().catch(() => null)) as { videos?: PexelsVideo[] } | null)?.videos ?? []
    let best: { s: number; v: PexelsVideo; link: string } | null = null
    videos.forEach((v) => {
      if ((v.duration ?? 0) < MIN_DURATION) return
      const f = bestFile(v)
      if (!f) return
      const s = score(v, f)
      if (!best || s > best.s) best = { s, v, link: f.link }
    })
    console.log(`[pexels-video] "${query}": ${videos.length} videos → ${best ? `picked score=${(best as { s: number }).s.toFixed(2)}` : 'NO usable landscape clip'}`)
    if (!best) return null
    return {
      url: best.link, score: best.s, poster: validPoster(typeof best.v.image === 'string' ? best.v.image : null),
      credit: { pexelsUrl: typeof best.v.url === 'string' ? best.v.url : null, name: best.v.user?.name ?? null, url: best.v.user?.url ?? null },
    }
  } catch (e) { console.error(`[pexels-video] error: ${String(e)}`); return null }
}

const out = (r: Resolved) => ({ url: r.url, poster: r.poster, credit: r.credit })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS })

  let body: { city?: string; country?: string } = {}
  try { body = await req.json() } catch { /* keep empty */ }
  const city = (body.city ?? '').slice(0, 120)
  const country = (body.country ?? '').slice(0, 120)
  const authed = isAuthed(req)
  console.log(`[pexels-video] req authed=${authed} city="${city}" country="${country}"`)
  if (!authed) return json({ url: null }) // abuse gate: authenticated users only

  const nCity = normalize(city), nCountry = normalize(country)
  if (!nCity) return json({ url: null })

  const key = `${nCity}|${nCountry}`
  const countryKey = nCountry ? `~|${nCountry}` : ''

  const cached = await cacheGet(key)
  if (cached && !cached.stale) return json(out(cached), 'HIT')
  const stale = cached?.stale ? cached : null // keep for outage fallback

  if (!PEXELS_API_KEY) return stale ? json(out(stale), 'STALE') : json({ url: null })

  // Search "city country" to disambiguate (Paris/Springfield/…), BUT only when
  // the country differs from the city — else "Luxembourg Luxembourg" / "Monaco
  // Monaco" doubles the word and returns nothing.
  const cityQuery = nCountry && nCountry !== nCity ? `${city} ${country}` : city
  const cityRes = await searchPexels(cityQuery)
  let chosen = cityRes
  let level: 'city' | 'country' = 'city'
  let resolvedQuery = cityQuery

  if ((!cityRes || cityRes.score < MIN_GOOD_SCORE) && nCountry && nCountry !== nCity) {
    const cHit = countryKey ? await cacheGet(countryKey) : null
    const countryRes = cHit && !cHit.stale ? cHit : await searchPexels(country)
    if (countryRes && (!cityRes || countryRes.score > cityRes.score + COUNTRY_MARGIN)) {
      chosen = countryRes; level = 'country'; resolvedQuery = country
      if (countryKey && (!cHit || cHit.stale)) await cachePut(countryKey, countryRes, country, 'country')
    }
  }

  if (chosen) {
    await cachePut(key, chosen, resolvedQuery, level)
    return json(out(chosen), 'MISS')
  }
  // Pexels gave nothing this time — serve a stale clip if we have one.
  if (stale) return json(out(stale), 'STALE')
  return json({ url: null }, 'MISS')
})
