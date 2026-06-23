import type { Stop } from '../types'

/**
 * The location-identifying fields of a stop — the subset that "where is this
 * place" owns. A re-pick (or an Add) resolves a chosen suggestion / typed name
 * into one of these and nothing else, so the rest of the stop (photos, note,
 * booking, kind, time, duration…) is never touched by a location change.
 */
export interface PlaceLocation {
  name: string
  type?: string
  address?: string
  lat?: number
  lng?: number
  coords?: { lat: number; lng: number }
  coordinateSource?: 'ai' | 'geocoder'
}

/** A finite, non-zero number, or undefined. (0/NaN are the suggest placeholder.) */
function finite(value: unknown): number | undefined {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) && n !== 0 ? n : undefined
}

function str(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const s = value.trim()
  return s || undefined
}

/**
 * Resolve a chosen place — an AI suggestion `Stop` or a bare typed name — into
 * just its location fields. Coordinates are only carried when both lat/lng are
 * finite & non-zero (mirroring `suggest.ts`'s guard); `coords` is set to match.
 * Used by both AddStop (new stop) and StopDetail's Change location (re-pick), so
 * the "suggestion → location" mapping lives in exactly one place. Pure + tested.
 */
export function placeFromSuggestion(
  source: Pick<Stop, 'name' | 'type' | 'address' | 'lat' | 'lng' | 'coords'>,
): PlaceLocation {
  const place: PlaceLocation = { name: source.name }
  const type = str(source.type)
  if (type) place.type = type
  const address = str(source.address)
  if (address) place.address = address

  const lat = finite(source.lat ?? source.coords?.lat)
  const lng = finite(source.lng ?? source.coords?.lng)
  if (lat !== undefined && lng !== undefined) {
    place.lat = lat
    place.lng = lng
    place.coords = { lat, lng }
    place.coordinateSource = 'ai' // origin: the model supplied these numbers
  }
  return place
}

/**
 * Immutably replace a stop's *location* with `place`, returning a NEW stop.
 *
 * Replaced (location-identifying): `name`, `type`, `address`, `lat`, `lng`,
 * `coords`. Any of these absent on `place` is cleared on the result (e.g. moving
 * to a place with no coordinates drops the old pin rather than stranding it).
 *
 * Cleared (place-derived enrichment that now describes the *old* place):
 * `wikiTitle`, `facts`, `history`, `tips`, `image`.
 *
 * Preserved (user-owned, not tied to the location): `photos`, `note`,
 * `reservation` (and legacy `booking`), `kind`, `time`, `duration`, `icon`, and
 * any other field. Never mutates the
 * input. Pure + unit-tested.
 */
export function applyLocation(
  stop: Stop,
  place: PlaceLocation,
  now: string = new Date().toISOString(),
): Stop {
  // Drop everything the location owns or derives (incl. the old origin); keep rest.
  const {
    name: _n, type: _t, address: _a, lat: _la, lng: _lo, coords: _c,
    wikiTitle: _w, facts: _f, history: _h, tips: _ti, image: _i,
    coordinateSource: _cs,
    ...preserved
  } = stop
  void _n; void _t; void _a; void _la; void _lo; void _c
  void _w; void _f; void _h; void _ti; void _i; void _cs

  const next: Stop = { ...preserved, name: place.name, locationEditedAt: now }
  if (place.type) next.type = place.type
  if (place.address) next.address = place.address
  if (place.lat !== undefined && place.lng !== undefined) {
    next.lat = place.lat
    next.lng = place.lng
    next.coords = { lat: place.lat, lng: place.lng }
    if (place.coordinateSource) next.coordinateSource = place.coordinateSource
  }
  return next
}
