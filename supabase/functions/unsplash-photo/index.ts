// supabase/functions/unsplash-photo/index.ts
//
// PRIMARY cover-image source: Unsplash Search (proxied), with a shared global
// link cache. The Unsplash Access Key lives ONLY here, server-side.
//
// The client (app/src/trip/unsplash.ts) POSTs `{ query }`; this returns
// `{ url }` — a hotlinkable Unsplash CDN URL — or `{ url: null }` so the client
// falls through to Wikipedia.
//
// CACHE: resolved links are cached in the `cover_cache` table keyed by the
// normalized query (the location), so the SAME location hits the Unsplash search
// API only ONCE ever — every later trip (any user) is a free cache hit. The
// table is service-role-only; create it with docs/supabase/cover-cache.sql.
//
// GRACEFUL: with no UNSPLASH_ACCESS_KEY (or no service key / no table) it still
// returns 200 `{ url: cached|null }` and NEVER 500s the app.
//
// DEPLOY:  supabase functions deploy unsplash-photo
// SECRET:  supabase secrets set UNSPLASH_ACCESS_KEY=<your Access Key>
// (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are auto-injected — no setup.)

const UNSPLASH_ACCESS_KEY = Deno.env.get('UNSPLASH_ACCESS_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  Deno.env.get('SERVICE_ROLE_KEY') ??
  ''
const RATE_LIMIT_PER_HOUR = 200
const rate = new Map<string, { count: number; resetAt: number }>()

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

function ok(ip: string): boolean {
  const now = Date.now()
  const e = rate.get(ip)
  if (!e || now > e.resetAt) { rate.set(ip, { count: 1, resetAt: now + 3600_000 }); return true }
  if (e.count >= RATE_LIMIT_PER_HOUR) return false
  e.count++; return true
}

// --- cover_cache table access (service role; bypasses RLS) ----------------
function dbHeaders(extra: Record<string, string> = {}) {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...extra }
}

/** Read a cached cover URL for the normalized key, or null on any miss/error. */
async function cacheGet(key: string): Promise<string | null> {
  if (!SERVICE_KEY || !SUPABASE_URL) return null
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/cover_cache?query_key=eq.${encodeURIComponent(key)}&select=url&limit=1`,
      { headers: dbHeaders() },
    )
    if (!r.ok) return null
    const rows = (await r.json().catch(() => null)) as Array<{ url?: string }> | null
    const url = rows?.[0]?.url
    return typeof url === 'string' && url ? url : null
  } catch {
    return null
  }
}

/** Cache a resolved cover URL. Fire-and-forget; concurrent duplicates ignored. */
async function cachePut(key: string, url: string): Promise<void> {
  if (!SERVICE_KEY || !SUPABASE_URL) return
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/cover_cache`, {
      method: 'POST',
      headers: dbHeaders({ Prefer: 'resolution=ignore-duplicates,return=minimal' }),
      body: JSON.stringify({ query_key: key, url }),
    })
  } catch {
    /* best-effort cache write — never blocks the response */
  }
}

/**
 * Resolve the first landscape Unsplash result for `query`, resized for a crisp
 * cover (~1600px wide JPEG). Returns null on any miss/error — the key never
 * leaves this function.
 */
async function findCover(query: string): Promise<string | null> {
  try {
    const url =
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}` +
      `&orientation=landscape&per_page=1&content_filter=high`
    const r = await fetch(url, {
      headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}`, 'Accept-Version': 'v1' },
    })
    if (!r.ok) { console.error(`[unsplash-photo] search ${r.status}: ${await r.text().catch(() => '')}`); return null }
    const data = await r.json().catch(() => null) as { results?: Array<{ urls?: { raw?: string } }> } | null
    const raw = data?.results?.[0]?.urls?.raw
    if (typeof raw !== 'string' || !raw) return null
    // Unsplash raw URLs accept Imgix resize params; cap width + JPEG for a sharp,
    // light cover. CSS object-cover handles the per-tile crop.
    return `${raw}&w=1600&q=80&fm=jpg&fit=max`
  } catch (e) {
    console.error(`[unsplash-photo] error: ${String(e)}`)
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS })

  let body: { query?: string }
  try { body = await req.json() } catch { return json({ url: null }) }
  const query = (body.query ?? '').slice(0, 200).trim()
  if (!query) return json({ url: null })
  const key = query.toLowerCase()

  // Cache hit → no Unsplash call, no rate-limit consumed.
  const cached = await cacheGet(key)
  if (cached) return json({ url: cached }, 'HIT')

  // Miss → need the Unsplash key to search (dormant/graceful when unset).
  if (!UNSPLASH_ACCESS_KEY) return json({ url: null })

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  if (!ok(ip)) return new Response('Rate limit', { status: 429, headers: CORS })

  const url = await findCover(query)
  if (url) await cachePut(key, url)
  return json({ url }, 'MISS')
})
