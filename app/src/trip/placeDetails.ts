// app/src/trip/placeDetails.ts
//
// PAID, DORMANT opening-hours + price client: Google Places (proxied).
// POSTs { query?, placeId? } to the `place-details` edge function, which holds
// the key server-side and answers { hours:null, price:null } when the key is
// unset. Never throws; returns {} on any miss so chips simply don't show.
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabase } from '../lib/supabase'
import type { PriceLevel } from '../types'

/** Deploy slug — must match `supabase functions deploy place-details`. */
const PLACE_DETAILS_FN_SLUG = 'place-details'

const PRICE_MAP: Record<string, PriceLevel> = {
  PRICE_LEVEL_INEXPENSIVE: '$',
  PRICE_LEVEL_MODERATE: '$$',
  PRICE_LEVEL_EXPENSIVE: '$$$',
  PRICE_LEVEL_VERY_EXPENSIVE: '$$$$',
}

/** Map Google's raw priceLevel enum to a canonical symbol, or undefined. Pure. */
export function mapGooglePrice(raw: string | null | undefined): PriceLevel | undefined {
  if (typeof raw !== 'string') return undefined
  return PRICE_MAP[raw.trim()]
}

export interface StopPlaceDetails {
  placeId?: string
  hours?: string[]
  price?: PriceLevel
}

function detailsProxyUrl(base = SUPABASE_URL): string {
  return `${base.replace(/\/$/, '')}/functions/v1/${PLACE_DETAILS_FN_SLUG}`
}
async function authToken(): Promise<string> {
  try { const { data } = await supabase.auth.getSession(); if (data?.session?.access_token) return data.session.access_token } catch { /* anon */ }
  return SUPABASE_ANON_KEY
}

/**
 * Fetch opening hours + price for a stop via the place-details proxy. Prefers a
 * known `placeId`; falls back to a text `query` ("Name, Destination"). Returns
 * only the fields Google had — `{}` when the key is dormant or nothing matched.
 * Never throws.
 */
export async function fetchPlaceDetails(input: { placeId?: string; query?: string }): Promise<StopPlaceDetails> {
  const placeId = (input.placeId ?? '').trim()
  const query = (input.query ?? '').trim()
  if (!placeId && !query) return {}
  try {
    const res = await fetch(detailsProxyUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (await authToken()), apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ placeId: placeId || undefined, query: query || undefined }),
    })
    if (!res.ok) return {}
    const json = await res.json().catch(() => null) as { placeId?: string | null; hours?: string[] | null; price?: string | null } | null
    if (!json) return {}
    const out: StopPlaceDetails = {}
    if (typeof json.placeId === 'string' && json.placeId) out.placeId = json.placeId
    if (Array.isArray(json.hours) && json.hours.length) out.hours = json.hours.map(String)
    const price = mapGooglePrice(json.price)
    if (price) out.price = price
    return out
  } catch {
    return {}
  }
}
