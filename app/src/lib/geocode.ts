/**
 * Forward geocoding via Photon (komoot) — an OSM-backed, key-less, CORS-enabled
 * geocoder. Resolves a place query (a POI or address, unlike the place-only
 * `lib/photon.ts` autocomplete) into a single `{ lat, lng, address? }`, biased
 * by an optional `near` locality so "Trastevere" disambiguates to Rome.
 *
 * The URL builder + parser are pure (unit-tested); `geocodePlace` wraps them in
 * a guarded `fetch` that NEVER throws — any miss/error resolves to `null`, so
 * callers degrade gracefully (the stop simply earns no pin yet). Shared platform
 * helper: Plan, Guide, destination search and the future location cache use it.
 */

import type { Stop, Trip } from '../types'

export interface GeoPoint {
  lat: number
  lng: number
  address?: string
}

/** A finite real number, else undefined. */
function finite(n: unknown): number | undefined {
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

/**
 * Build the Photon forward-geocode URL for `query`, optionally biased by a
 * `near` locality (folded into the query so Photon ranks the right place first).
 * Caps to a single best result and asks for English labels. URL-encoded.
 */
export function geocodeUrl(query: string, near?: string): string {
  const q = near && near.trim() ? `${query.trim()}, ${near.trim()}` : query.trim()
  const params = new URLSearchParams({ q, limit: '1', lang: 'en' })
  return `https://photon.komoot.io/api?${params.toString()}`
}

/** A Photon point feature, loosely typed. */
interface PhotonFeature {
  geometry?: { coordinates?: unknown }
  properties?: {
    name?: unknown
    street?: unknown
    housenumber?: unknown
    city?: unknown
    state?: unknown
    country?: unknown
  }
}

/** Assemble a compact "<street>, <city>, <country>" label, dropping blanks. */
function addressOf(props: PhotonFeature['properties']): string | undefined {
  if (!props) return undefined
  const street = [str(props.housenumber), str(props.street)].filter(Boolean).join(' ').trim()
  const label = [street, str(props.city) || str(props.state), str(props.country)]
    .filter(Boolean)
    .join(', ')
  return label || undefined
}

/**
 * Parse a Photon GeoJSON response into the first feature's `{ lat, lng,
 * address? }`. GeoJSON coordinates are `[lng, lat]` (note the order). Returns
 * `null` on any miss or shape error — never throws.
 */
export function parseGeocode(json: unknown): GeoPoint | null {
  if (typeof json !== 'object' || json === null) return null
  const features = (json as { features?: unknown }).features
  if (!Array.isArray(features) || features.length === 0) return null
  const first = features[0] as PhotonFeature
  const coords = first?.geometry?.coordinates
  if (!Array.isArray(coords)) return null
  const lng = finite(coords[0])
  const lat = finite(coords[1])
  if (lat === undefined || lng === undefined) return null
  const address = addressOf(first.properties)
  return address ? { lat, lng, address } : { lat, lng }
}

/**
 * Resolve `query` to a single `{ lat, lng, address? }`, biased by `near`, or
 * `null`. Guards an empty query (no fetch). Any failure (network, non-OK, bad
 * JSON, no result) resolves to `null` — never throws.
 */
export async function geocodePlace(query: string, near?: string): Promise<GeoPoint | null> {
  const q = query.trim()
  if (!q) return null
  try {
    const res = await fetch(geocodeUrl(q, near))
    if (!res.ok) return null
    const json: unknown = await res.json()
    return parseGeocode(json)
  } catch {
    return null
  }
}

/** The identity of the unresolved place that initiated a geocoder lookup. */
export interface GeocodeOrigin {
  name: string
  address?: string
}

/** True when a stop already has finite, non-placeholder coordinates. */
function hasFiniteCoords(stop: { lat?: number; lng?: number; coords?: { lat: number; lng: number } }): boolean {
  const lat = stop.lat ?? stop.coords?.lat
  const lng = stop.lng ?? stop.coords?.lng
  return (
    typeof lat === 'number' && typeof lng === 'number' &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    !(lat === 0 && lng === 0) // 0/0 is the suggest placeholder, not a real pin
  )
}

/**
 * Last-write-wins guard: may an in-flight geocoder result patch this stop?
 *
 * Only when the stop STILL lacks real coordinates AND STILL matches the
 * name/address that initiated the lookup. If the user relocated the stop (new
 * name/address) or it otherwise gained coords while the lookup was in flight,
 * the result is stale and MUST be discarded. Kills the
 * create→geocode→relocate→clobber race. Pure + unit-tested.
 */
export function canApplyGeocode(
  current: { name: string; address?: string; lat?: number; lng?: number; coords?: { lat: number; lng: number } },
  origin: GeocodeOrigin,
): boolean {
  if (hasFiniteCoords(current)) return false
  if (current.name !== origin.name) return false
  if ((current.address ?? undefined) !== (origin.address ?? undefined)) return false
  return true
}

/** Locate a stop by its canonical placeId. Returns its position + the stop, or null. */
export function findStopByPlaceId(trip: Pick<Trip, 'data'>, placeId: string): { dayIndex: number; stopIndex: number; stop: Stop } | null {
  const days = trip.data?.days ?? []
  for (let d = 0; d < days.length; d++) {
    const stops = days[d]?.stops ?? []
    for (let s = 0; s < stops.length; s++) {
      if (stops[s].placeId === placeId) return { dayIndex: d, stopIndex: s, stop: stops[s] }
    }
  }
  return null
}

/**
 * May an in-flight place-details response patch this stop? Only when the stop
 * still exists AND its `placeId` still matches the response's. Guards against a
 * deleted/relocated stop being mutated by a stale response. Pure.
 */
export function canApplyPlaceDetails(current: Pick<Stop, 'placeId'> | null | undefined, detailsPlaceId: string): boolean {
  return !!current && current.placeId === detailsPlaceId
}
