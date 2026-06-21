// supabase/functions/place-photo/index.ts
//
// PAID, DORMANT hero-image fallback: Google Places Photos (proxied).
//
// This is the last image layer before the placeholder, tried only when
// Wikipedia pageimages AND Wikimedia Commons both miss (typically commercial
// places — restaurants/cafés/shops — that have no free media). The Google
// Places API key lives ONLY here, server-side, and is NEVER returned to the
// client.
//
// GRACEFUL BY DESIGN: when GOOGLE_PLACES_API_KEY is unset (the default), this
// returns 200 JSON `{ "url": null }` so the client simply falls through to the
// placeholder and the app behaves EXACTLY as it does today. It must NEVER 500
// the app for a missing key or any downstream failure.
//
// DEPLOY NOTE: the client invokes this at slug `place-photo` (constant
// PLACE_PHOTO_FN_SLUG in app/src/trip/guide/placePhoto.ts). The invoke-URL slug
// is fixed at create time — deploy this function UNDER THE NAME `place-photo`
// (`supabase functions deploy place-photo`). If Supabase auto-renames the slug
// (as it did for narrate -> "hyper-function"), update PLACE_PHOTO_FN_SLUG in
// the client to match the real slug.
//
// SECRET: set the key with
//   supabase secrets set GOOGLE_PLACES_API_KEY=<key>
// (Until then the function answers `{ "url": null }` and the layer is dormant.)

const GOOGLE_PLACES_API_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
// Supabase auto-injects SUPABASE_SERVICE_ROLE_KEY; fall back to common aliases.
const SERVICE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  Deno.env.get('SERVICE_ROLE_KEY') ??
  ''
// Reuse the existing `narration` bucket (no new bucket needed); namespaced path.
const BUCKET = 'narration'
const CACHE_PREFIX = 'placephoto'
const PHOTO_MAX_WIDTH = 800
const RATE_LIMIT_PER_HOUR = 120
const rate = new Map<string, { count: number; resetAt: number }>()

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** 200 JSON `{ url: null }` — the universal "no image, fall through" reply. */
function nullPhoto() {
  return new Response(JSON.stringify({ url: null }), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function ok(ip: string) {
  const now = Date.now(); const e = rate.get(ip)
  if (!e || now > e.resetAt) { rate.set(ip, { count: 1, resetAt: now + 3600_000 }); return true }
  if (e.count >= RATE_LIMIT_PER_HOUR) return false
  e.count++; return true
}

/** Stable cache key for a query — FNV-1a hex. */
function cacheKey(query: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < query.length; i++) { h ^= query.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return (h >>> 0).toString(16)
}

// Supabase Storage REST needs BOTH the apikey and Authorization headers.
function storageHeaders(extra: Record<string, string> = {}) {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, ...extra }
}
async function storageGet(path: string): Promise<ArrayBuffer | null> {
  if (!SERVICE_KEY) return null
  try {
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, { headers: storageHeaders() })
    if (!r.ok) {
      if (r.status !== 404 && r.status !== 400) console.error(`[place-photo] storageGet ${r.status}: ${await r.text().catch(() => '')}`)
      return null
    }
    return await r.arrayBuffer()
  } catch (e) {
    console.error(`[place-photo] storageGet error: ${String(e)}`)
    return null
  }
}
async function storagePut(path: string, body: ArrayBuffer) {
  if (!SERVICE_KEY) return
  try {
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
      method: 'POST',
      headers: storageHeaders({ 'Content-Type': 'image/jpeg', 'x-upsert': 'true' }),
      body,
    })
    if (!r.ok) console.error(`[place-photo] storagePut ${r.status}: ${await r.text().catch(() => '')}`)
  } catch (e) {
    console.error(`[place-photo] storagePut error: ${String(e)}`)
  }
}

/**
 * Resolve a place's first photo resource name (e.g. `places/XXX/photos/YYY`)
 * via Places API (New) Text Search. Returns null on any miss/error — the key
 * never leaves this function.
 */
async function findPhotoName(query: string): Promise<string | null> {
  try {
    const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY as string,
        'X-Goog-FieldMask': 'places.photos,places.displayName',
      },
      body: JSON.stringify({ textQuery: query }),
    })
    if (!r.ok) return null
    const json = await r.json().catch(() => null) as { places?: Array<{ photos?: Array<{ name?: string }> }> } | null
    const name = json?.places?.[0]?.photos?.[0]?.name
    return typeof name === 'string' && name ? name : null
  } catch {
    return null
  }
}

/** Fetch the JPEG bytes for a photo resource name, or null. */
async function fetchPhotoBytes(photoName: string): Promise<ArrayBuffer | null> {
  try {
    const mediaUrl = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${PHOTO_MAX_WIDTH}&key=${GOOGLE_PLACES_API_KEY}`
    const r = await fetch(mediaUrl)
    if (!r.ok) return null
    const ct = r.headers.get('content-type') ?? ''
    if (!ct.startsWith('image/')) return null // non-image (an error JSON) -> fall through
    return await r.arrayBuffer()
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS })

  // Dormant until an operator adds the key. NEVER 500 the app — fall through.
  if (!GOOGLE_PLACES_API_KEY) return nullPhoto()

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  if (!ok(ip)) return new Response('Rate limit', { status: 429, headers: CORS })

  let body: { query?: string; key?: string }
  try { body = await req.json() } catch { return nullPhoto() }
  const query = (body.query ?? '').slice(0, 200).trim()
  if (!query) return nullPhoto()

  const path = `${CACHE_PREFIX}/${body.key || cacheKey(query)}.jpg`
  const cached = await storageGet(path)
  if (cached) return new Response(cached, { headers: { ...CORS, 'Content-Type': 'image/jpeg', 'X-Cache': 'HIT' } })

  const photoName = await findPhotoName(query)
  if (!photoName) return nullPhoto()

  const bytes = await fetchPhotoBytes(photoName)
  if (!bytes) return nullPhoto()

  await storagePut(path, bytes) // fire-and-forget cache; errors ignored
  return new Response(bytes, { headers: { ...CORS, 'Content-Type': 'image/jpeg', 'X-Cache': 'MISS' } })
})
