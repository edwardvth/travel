// supabase/functions/place-details/index.ts
//
// PAID, DORMANT opening-hours + price proxy: Google Places API (New).
//
// Returns a place's regularOpeningHours.weekdayDescriptions (7 strings) and raw
// priceLevel enum for the stop-detail chips. The Google Places API key lives
// ONLY here, server-side, and is NEVER returned to the client. Reuses the same
// GOOGLE_PLACES_API_KEY secret as place-photo.
//
// GRACEFUL BY DESIGN: when GOOGLE_PLACES_API_KEY is unset (the default), this
// returns 200 JSON { placeId: null, hours: null, price: null } so the client
// simply shows no chips and the app behaves EXACTLY as today. NEVER 500s.
//
// DEPLOY: supabase functions deploy place-details  (slug must stay 'place-details';
// the client constant PLACE_DETAILS_FN_SLUG in app/src/trip/placeDetails.ts must match).

const GOOGLE_PLACES_API_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY')
const RATE_LIMIT_PER_HOUR = 120
const rate = new Map<string, { count: number; resetAt: number }>()

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface PlaceDetailsReply { placeId: string | null; displayName: string | null; hours: string[] | null; price: string | null }

function reply(body: PlaceDetailsReply, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}
const nullReply = () => reply({ placeId: null, displayName: null, hours: null, price: null })

function ok(ip: string): boolean {
  const now = Date.now(); const e = rate.get(ip)
  if (!e || now > e.resetAt) { rate.set(ip, { count: 1, resetAt: now + 3600_000 }); return true }
  if (e.count >= RATE_LIMIT_PER_HOUR) return false
  e.count++; return true
}

/** Shape we pull out of either a Details place object or a Text Search result. */
interface RawPlace {
  id?: string
  displayName?: { text?: string }
  regularOpeningHours?: { weekdayDescriptions?: unknown }
  priceLevel?: string
}

function pick(p: RawPlace | null | undefined): PlaceDetailsReply {
  if (!p) return { placeId: null, displayName: null, hours: null, price: null }
  const wd = p.regularOpeningHours?.weekdayDescriptions
  const hours = Array.isArray(wd) ? wd.map((s) => String(s)).filter(Boolean) : null
  return {
    placeId: typeof p.id === 'string' && p.id ? p.id : null,
    displayName: p.displayName?.text ?? null,
    hours: hours && hours.length ? hours : null,
    price: typeof p.priceLevel === 'string' && p.priceLevel ? p.priceLevel : null,
  }
}

const DETAILS_FIELDS = 'id,displayName,regularOpeningHours,priceLevel'
const SEARCH_FIELDS = 'places.id,places.displayName,places.regularOpeningHours,places.priceLevel'

async function byPlaceId(placeId: string): Promise<RawPlace | null> {
  try {
    const r = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
      headers: { 'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY as string, 'X-Goog-FieldMask': DETAILS_FIELDS },
    })
    if (!r.ok) return null
    return await r.json().catch(() => null) as RawPlace | null
  } catch { return null }
}

async function byQuery(query: string): Promise<RawPlace | null> {
  try {
    const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY as string,
        'X-Goog-FieldMask': SEARCH_FIELDS,
      },
      body: JSON.stringify({ textQuery: query }),
    })
    if (!r.ok) return null
    const json = await r.json().catch(() => null) as { places?: RawPlace[] } | null
    return json?.places?.[0] ?? null
  } catch { return null }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS })

  // Dormant until an operator sets the key. NEVER 500 the app — fall through.
  if (!GOOGLE_PLACES_API_KEY) return nullReply()

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  if (!ok(ip)) return new Response('Rate limit', { status: 429, headers: CORS })

  let body: { query?: string; placeId?: string }
  try { body = await req.json() } catch { return nullReply() }

  const placeId = (body.placeId ?? '').trim()
  const query = (body.query ?? '').slice(0, 200).trim()
  if (!placeId && !query) return nullReply()

  const raw = placeId ? await byPlaceId(placeId) : await byQuery(query)
  return reply(pick(raw))
})
