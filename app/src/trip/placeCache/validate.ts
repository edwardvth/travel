/** Google place ids are opaque `[A-Za-z0-9_-]`, ≥ ~20 chars in practice. */
export function isValidPlaceIdShape(placeId: string): boolean {
  return /^[A-Za-z0-9_-]{16,}$/.test(placeId)
}

export interface PlaceRequest {
  placeId: string
  name?: string
  destination?: string
  coords?: { lat: number; lng: number }
  placeTypes?: string[]
}

/**
 * Validate an enrichment request BEFORE any generation — cheap shape gate that
 * stops malformed/fake ids from creating rows. (Existence is verified server-
 * side via Google Place Details; this is the pre-check.) Pure.
 * MIRROR: copied into supabase/functions/enrich-place.
 */
export function validatePlaceRequest(req: PlaceRequest): { ok: boolean; reason?: string } {
  if (!isValidPlaceIdShape(req.placeId)) return { ok: false, reason: 'bad_place_id' }
  if (req.name !== undefined && req.name.trim().length === 0) return { ok: false, reason: 'empty_name' }
  if (req.coords) {
    const { lat, lng } = req.coords
    const finite = (n: unknown) => typeof n === 'number' && Number.isFinite(n)
    if (!finite(lat) || !finite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return { ok: false, reason: 'bad_coords' }
    }
  }
  return { ok: true }
}
