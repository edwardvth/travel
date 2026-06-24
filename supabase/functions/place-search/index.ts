// supabase/functions/place-search/index.ts
//
// PAID place autocomplete proxy: Google Places API (New). The Google key lives
// ONLY here (server-side) and is NEVER returned to the client. The client builds
// the autocomplete request body + parses responses (see app/src/lib/placeSearch.ts);
// this function only injects the key and forwards to the two whitelisted endpoints.
//
// GRACEFUL: when GOOGLE_PLACES_API_KEY is unset, returns {predictions:[]} / {place:null}
// so the UI falls back. NEVER 500s the app. Reuses the shared place-photo key.
//   supabase functions deploy place-search

const GOOGLE_PLACES_API_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY')
const RATE_LIMIT_PER_HOUR = 600
const rate = new Map<string, { count: number; resetAt: number }>()

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { ...CORS, 'Content-Type': 'application/json' } })

function ok(ip: string): boolean {
  const now = Date.now(); const e = rate.get(ip)
  if (!e || now > e.resetAt) { rate.set(ip, { count: 1, resetAt: now + 3600_000 }); return true }
  if (e.count >= RATE_LIMIT_PER_HOUR) return false
  e.count++; return true
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS })
  if (!GOOGLE_PLACES_API_KEY) return json({ predictions: [], place: null })

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  if (!ok(ip)) return new Response('Rate limit', { status: 429, headers: CORS })

  let payload: { action?: string; body?: unknown; placeId?: string; sessionToken?: string }
  try { payload = await req.json() } catch { return json({ predictions: [], place: null }) }

  try {
    if (payload.action === 'autocomplete') {
      const r = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY as string },
        body: JSON.stringify(payload.body ?? {}),
      })
      if (!r.ok) { console.error(`[place-search] autocomplete ${r.status}: ${await r.text().catch(() => '')}`); return json({ predictions: [] }) }
      return json(await r.json())
    }
    if (payload.action === 'details') {
      const placeId = (payload.placeId ?? '').replace(/[^A-Za-z0-9_-]/g, '')
      if (!placeId) return json({ place: null })
      const token = encodeURIComponent(payload.sessionToken ?? '')
      const url = `https://places.googleapis.com/v1/places/${placeId}?sessionToken=${token}`
      const r = await fetch(url, {
        headers: { 'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY as string, 'X-Goog-FieldMask': 'location,formattedAddress,displayName,types' },
      })
      if (!r.ok) { console.error(`[place-search] details ${r.status}: ${await r.text().catch(() => '')}`); return json({ place: null }) }
      return json(await r.json())
    }
    return json({ predictions: [], place: null })
  } catch (e) {
    console.error(`[place-search] error: ${String(e)}`)
    return json({ predictions: [], place: null })
  }
})
