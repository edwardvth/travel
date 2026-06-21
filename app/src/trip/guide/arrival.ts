import { haversineKm, type LatLng } from '../walk'

/** Enter arrival inside this radius (m). */
export const ARRIVE_RADIUS_M = 40
/** Only leave arrival past this larger radius (m) — hysteresis to avoid flapping. */
export const LEAVE_RADIUS_M = 80

/**
 * Geofence predicate with hysteresis. `wasArrived` is the previous arrival
 * state for this stop: once arrived, stays arrived until past LEAVE_RADIUS_M.
 * Returns false when the stop has no finite coordinates. Pure.
 */
export function isArrived(
  pos: LatLng,
  stop: { lat?: number; lng?: number },
  wasArrived: boolean,
): boolean {
  if (typeof stop.lat !== 'number' || typeof stop.lng !== 'number') return false
  const meters = haversineKm(pos, { lat: stop.lat, lng: stop.lng }) * 1000
  return wasArrived ? meters <= LEAVE_RADIUS_M : meters <= ARRIVE_RADIUS_M
}
