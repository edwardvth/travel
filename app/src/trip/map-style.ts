/**
 * Muted, low-saturation hue per day index for the "all days" map overview.
 * Replaces the old vivid `hsl(…, 65%, 48%)` ramp with a calmer treatment so
 * multi-day overviews stay legible against CARTO tiles and read as one premium
 * map, not a rainbow. Single-day views use the claret signature instead (the
 * caller passes the computed `--sig-btn`); this is only for `scope === 'all'`.
 * Pure + unit-tested.
 */
export function dayColor(day: number, total: number): string {
  const n = Math.max(total, 1)
  const hue = Math.round((day * 360) / n)
  return `hsl(${hue}, 32%, 52%)` // muted saturation, gentle lightness
}
