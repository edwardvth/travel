import type { Stop } from '../types'

/** A simple geographic point. */
export interface LatLng {
  lat: number
  lng: number
}

/** Average walking speed in km/h (legacy parity). */
const WALK_KMH = 4.8

/**
 * Great-circle distance in kilometres between two lat/lng points (haversine).
 * Pure + unit-tested.
 */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371 // mean earth radius, km
  const toRad = Math.PI / 180
  const dLat = (b.lat - a.lat) * toRad
  const dLng = (b.lng - a.lng) * toRad
  const lat1 = a.lat * toRad
  const lat2 = b.lat * toRad
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * R * Math.asin(Math.sqrt(s))
}

/**
 * Estimated walking time between two points, in whole minutes.
 * Great-circle distance / 4.8 km/h, rounded, with a floor of 1 minute so
 * adjacent stops never read as "0 min". Pure + unit-tested.
 */
export function walkMinutes(a: LatLng, b: LatLng): number {
  const km = haversineKm(a, b)
  const mins = (km / WALK_KMH) * 60
  return Math.max(1, Math.round(mins))
}

/**
 * Extract finite coordinates from a stop, accepting either flat `lat`/`lng`
 * or nested `coords`. Returns `null` when neither yields two finite numbers —
 * the caller skips the connector rather than guessing. Pure + unit-tested.
 */
export function stopCoords(stop: Pick<Stop, 'lat' | 'lng' | 'coords'>): LatLng | null {
  const lat = stop.lat ?? stop.coords?.lat
  const lng = stop.lng ?? stop.coords?.lng
  if (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
  ) {
    return { lat, lng }
  }
  return null
}

/**
 * Human label for a walk estimate. Up to 60 min reads "12 min walk"; beyond an
 * hour it mirrors the legacy compact form: ">1 h" at exactly 60+ with no spare
 * minutes is shown as "1 h", and e.g. "1 h 5 min" with the remainder. Pure +
 * unit-tested.
 */
export function formatWalk(min: number): string {
  const m = Math.max(1, Math.round(min))
  if (m < 60) return `${m} min walk`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h} h ${r} min walk` : `${h} h walk`
}
