// supabase/functions/unsplash-photo/index.ts
//
// PRIMARY cover-image source: Unsplash Search (proxied). Higher quality than the
// Wikipedia thumbnail fallback. The Unsplash Access Key lives ONLY here,
// server-side, and is NEVER returned to the client.
//
// The client (app/src/trip/unsplash.ts) POSTs `{ query }`; this returns
// `{ url }` — a hotlinkable Unsplash CDN URL resized for a crisp cover — or
// `{ url: null }` so the client falls through to Wikipedia.
//
// GRACEFUL BY DESIGN: when UNSPLASH_ACCESS_KEY is unset (the default), this
// returns 200 JSON `{ "url": null }`, so covers behave EXACTLY as they do today
// (Wikipedia). It must NEVER 500 the app for a missing key or any failure.
//
// DEPLOY:  supabase functions deploy unsplash-photo
// SECRET:  supabase secrets set UNSPLASH_ACCESS_KEY=<your Access Key>

const UNSPLASH_ACCESS_KEY = Deno.env.get('UNSPLASH_ACCESS_KEY')
const RATE_LIMIT_PER_HOUR = 200
const rate = new Map<string, { count: number; resetAt: number }>()

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { ...CORS, 'Content-Type': 'application/json' } })

function ok(ip: string): boolean {
  const now = Date.now()
  const e = rate.get(ip)
  if (!e || now > e.resetAt) { rate.set(ip, { count: 1, resetAt: now + 3600_000 }); return true }
  if (e.count >= RATE_LIMIT_PER_HOUR) return false
  e.count++; return true
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

  // Dormant until an operator adds the key. NEVER 500 the app — fall through.
  if (!UNSPLASH_ACCESS_KEY) return json({ url: null })

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  if (!ok(ip)) return new Response('Rate limit', { status: 429, headers: CORS })

  let body: { query?: string }
  try { body = await req.json() } catch { return json({ url: null }) }
  const query = (body.query ?? '').slice(0, 200).trim()
  if (!query) return json({ url: null })

  return json({ url: await findCover(query) })
})
