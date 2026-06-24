import { geocodeUrl } from '../lib/geocode'
import { stopCoords, type LatLng } from './walk'
import type { Stop, Trip } from '../types'

/** Resolved geo for a trip destination — center + ISO-3166-1 alpha-2 country + state. */
export interface RegionGeo {
  lat: number
  lng: number
  /** Lowercased ISO-3166-1 alpha-2 (ready for Places `includedRegionCodes`); '' when unknown. */
  countryCode: string
  state?: string
}

const finite = (n: unknown): number | undefined =>
  typeof n === 'number' && Number.isFinite(n) ? n : undefined
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/**
 * Parse a Photon GeoJSON response into a RegionGeo — first feature's center
 * ([lng,lat]) + lowercased countrycode + state. Returns null on any miss/shape
 * error. countryCode may be '' (center still usable for bias). Pure.
 */
export function parseRegion(json: unknown): RegionGeo | null {
  if (typeof json !== 'object' || json === null) return null
  const features = (json as { features?: unknown }).features
  if (!Array.isArray(features) || features.length === 0) return null
  const first = features[0] as { geometry?: { coordinates?: unknown }; properties?: Record<string, unknown> }
  const coords = first?.geometry?.coordinates
  if (!Array.isArray(coords)) return null
  const lng = finite(coords[0])
  const lat = finite(coords[1])
  if (lat === undefined || lng === undefined) return null
  const props = first.properties ?? {}
  const countryCode = str(props.countrycode).toLowerCase()
  const state = str(props.state)
  return state ? { lat, lng, countryCode, state } : { lat, lng, countryCode }
}

/**
 * Resolve a destination string to its RegionGeo via Photon, or null. Guards an
 * empty query (no fetch). Any failure resolves to null — never throws.
 */
export async function resolveRegion(destination: string, signal?: AbortSignal): Promise<RegionGeo | null> {
  const q = (destination || '').trim()
  if (!q) return null
  try {
    const res = await fetch(geocodeUrl(q), { signal })
    if (!res.ok) return null
    return parseRegion(await res.json())
  } catch {
    return null
  }
}

/** The last (most recently added) coord-bearing stop in a list, or null. */
function lastCoordStop(stops: Stop[]): LatLng | null {
  for (let i = stops.length - 1; i >= 0; i--) {
    const c = stopCoords(stops[i])
    if (c) return c
  }
  return null
}

/**
 * Autocomplete bias center for the day being planned, by priority:
 *   1. most recent coord-bearing stop in the current day,
 *   2. most recent coord-bearing stop anywhere in the trip,
 *   3. the trip's destinationGeo center,
 * else undefined (caller omits locationBias). Pure.
 */
export function biasCenter(trip: Pick<Trip, 'config' | 'data'>, dayIndex: number): LatLng | undefined {
  const days = trip.data?.days ?? []
  const inDay = lastCoordStop(days[dayIndex]?.stops ?? [])
  if (inDay) return inDay
  const inTrip = lastCoordStop(days.flatMap(d => d?.stops ?? []))
  if (inTrip) return inTrip
  const geo = trip.config?.destinationGeo
  if (geo && Number.isFinite(geo.lat) && Number.isFinite(geo.lng)) return { lat: geo.lat, lng: geo.lng }
  return undefined
}
