import type { Hotel } from '../types'

/** Finite-number guard for optional coordinate fields. */
function finite(n: unknown): number | undefined {
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined
}

/** Trim a value to a non-empty string, or undefined. */
function str(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const t = v.trim()
  return t ? t : undefined
}

/**
 * Normalize the loosely-stored `data.hotel` into a typed {@link Hotel} or null.
 * Backward-compatible by design:
 *   - a bare string becomes `{ name }` (oldest trips stored just a name);
 *   - an object is passed through, keeping only the known fields (name/address/
 *     note as trimmed strings, lat/lng as finite numbers);
 *   - null/undefined/empty (no usable field) → null.
 * Pure + unit-tested. Never throws.
 */
export function normalizeHotel(raw: unknown): Hotel | null {
  if (raw == null) return null

  if (typeof raw === 'string') {
    const name = str(raw)
    return name ? { name } : null
  }

  if (typeof raw !== 'object') return null

  const o = raw as Record<string, unknown>
  const hotel: Hotel = {}
  const name = str(o.name)
  const address = str(o.address)
  const note = str(o.note)
  const checkIn = str(o.checkIn)
  const checkOut = str(o.checkOut)
  const lat = finite(o.lat)
  const lng = finite(o.lng)
  if (name) hotel.name = name
  if (address) hotel.address = address
  if (note) hotel.note = note
  if (checkIn) hotel.checkIn = checkIn
  if (checkOut) hotel.checkOut = checkOut
  if (lat !== undefined) hotel.lat = lat
  if (lng !== undefined) hotel.lng = lng

  // Coords or dates alone (no name/address/note) aren't a meaningful Stay to show.
  return name || address || note ? hotel : null
}

/** Finite {lat,lng} for a hotel, or null when it has no usable coordinates. */
export function hotelCoords(hotel: Hotel | null): { lat: number; lng: number } | null {
  if (!hotel) return null
  const lat = finite(hotel.lat)
  const lng = finite(hotel.lng)
  return lat !== undefined && lng !== undefined ? { lat, lng } : null
}
