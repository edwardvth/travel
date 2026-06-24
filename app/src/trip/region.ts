import { geocodeUrl } from '../lib/geocode'

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
