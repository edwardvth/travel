import { SUPABASE_URL, SUPABASE_ANON_KEY, supabase } from './supabase'

/** A place-search prediction surfaced in the typeahead. */
export interface Prediction {
  placeId: string
  primaryText: string
  secondaryText: string
  types: string[]
}

/** A resolved place (from Place Details) used to patch a stop. */
export interface ResolvedPlace {
  name: string
  lat: number
  lng: number
  address?: string
  types: string[]
}

/** Bias inputs for an autocomplete request (country + optional center). */
export interface SearchRegion {
  countryCode: string
  lat?: number
  lng?: number
}

const finite = (n: unknown): number | undefined =>
  typeof n === 'number' && Number.isFinite(n) ? n : undefined
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

/**
 * Build the Google Places (New) autocomplete request body. Country-restricts when
 * a code is present and adds a 50 km circle bias when a center is present (the
 * Google max). Pure.
 */
export function buildAutocompleteBody(input: string, sessionToken: string, region: SearchRegion): Record<string, unknown> {
  const body: Record<string, unknown> = { input, sessionToken, languageCode: 'en' }
  if (region.countryCode) body.includedRegionCodes = [region.countryCode]
  const lat = finite(region.lat)
  const lng = finite(region.lng)
  if (lat !== undefined && lng !== undefined) {
    body.locationBias = { circle: { center: { latitude: lat, longitude: lng }, radius: 50000 } }
  }
  return body
}

/** Parse a Google autocomplete response into Prediction[]. Pure; never throws. */
export function parsePredictions(json: unknown): Prediction[] {
  if (typeof json !== 'object' || json === null) return []
  const suggestions = (json as { suggestions?: unknown }).suggestions
  if (!Array.isArray(suggestions)) return []
  const out: Prediction[] = []
  for (const s of suggestions) {
    const p = (s as { placePrediction?: Record<string, unknown> })?.placePrediction
    if (!p) continue
    const placeId = str(p.placeId)
    const sf = (p.structuredFormat ?? {}) as { mainText?: { text?: unknown }; secondaryText?: { text?: unknown } }
    const primaryText = str(sf.mainText?.text)
    if (!placeId || !primaryText) continue
    out.push({ placeId, primaryText, secondaryText: str(sf.secondaryText?.text), types: strArr(p.types) })
  }
  return out
}

/** Parse a Google Place Details response into a ResolvedPlace, or null. Pure. */
export function parseDetails(json: unknown): ResolvedPlace | null {
  if (typeof json !== 'object' || json === null) return null
  const j = json as { location?: { latitude?: unknown; longitude?: unknown }; formattedAddress?: unknown; displayName?: { text?: unknown }; types?: unknown }
  const lat = finite(j.location?.latitude)
  const lng = finite(j.location?.longitude)
  if (lat === undefined || lng === undefined) return null
  const address = str(j.formattedAddress)
  return {
    name: str(j.displayName?.text),
    lat, lng,
    ...(address ? { address } : {}),
    types: strArr(j.types),
  }
}

const PLACE_SEARCH_FN_SLUG = 'place-search'
const fnUrl = () => `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/${PLACE_SEARCH_FN_SLUG}`

async function authToken(): Promise<string> {
  try { const { data } = await supabase.auth.getSession(); if (data?.session?.access_token) return data.session.access_token } catch { /* anon */ }
  return SUPABASE_ANON_KEY
}

async function callFn(payload: Record<string, unknown>, signal?: AbortSignal): Promise<unknown | null> {
  try {
    const res = await fetch(fnUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (await authToken()), apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify(payload),
      signal,
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/** Autocomplete predictions for `input`, or [] on any miss. Never throws. */
export async function fetchPredictions(input: string, sessionToken: string, region: SearchRegion, signal?: AbortSignal): Promise<Prediction[]> {
  const q = input.trim()
  if (!q) return []
  const json = await callFn({ action: 'autocomplete', body: buildAutocompleteBody(q, sessionToken, region) }, signal)
  return parsePredictions(json)
}

/** Resolve a place's details, or null on any miss. Never throws. */
export async function fetchPlaceDetails(placeId: string, sessionToken: string): Promise<ResolvedPlace | null> {
  if (!placeId) return null
  const json = await callFn({ action: 'details', placeId, sessionToken })
  return parseDetails(json)
}
