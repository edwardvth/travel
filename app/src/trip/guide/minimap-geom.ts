import type { LatLng } from '../walk'

/**
 * Points along a gentle quadratic curve from `user` to `dest` — a stylized
 * **orientation** cue, never a routed path. The control point sits at the
 * midpoint pushed perpendicular to the straight user→dest vector by `curve` ×
 * the segment length, so the line bows slightly (more elegant than a straight
 * segment, still obviously "it's that way"). Returns `segments + 1` points.
 * Pure — does not mutate inputs. (Lat/lng treated as planar; fine at city scale.)
 */
export function stylizedPath(
  user: LatLng,
  dest: LatLng,
  curve = 0.12,
  segments = 24,
): LatLng[] {
  const mLat = (user.lat + dest.lat) / 2
  const mLng = (user.lng + dest.lng) / 2
  const dLat = dest.lat - user.lat
  const dLng = dest.lng - user.lng
  // Control point: midpoint offset along the perpendicular (-dLng, dLat) × curve.
  const cLat = mLat - dLng * curve
  const cLng = mLng + dLat * curve
  const out: LatLng[] = []
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const u = 1 - t
    out.push({
      lat: u * u * user.lat + 2 * u * t * cLat + t * t * dest.lat,
      lng: u * u * user.lng + 2 * u * t * cLng + t * t * dest.lng,
    })
  }
  return out
}
