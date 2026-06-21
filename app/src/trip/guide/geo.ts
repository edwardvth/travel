import type { LatLng } from '../walk'

/** Initial great-circle bearing from `a` to `b`, degrees in [0,360). Pure. */
export function bearing(a: LatLng, b: LatLng): number {
  const toRad = Math.PI / 180
  const φ1 = a.lat * toRad
  const φ2 = b.lat * toRad
  const Δλ = (b.lng - a.lng) * toRad
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  const deg = (Math.atan2(y, x) * 180) / Math.PI
  return (deg + 360) % 360
}

const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const

/** 8-point compass label for a bearing in degrees. Pure. */
export function compassLabel(deg: number): string {
  const i = Math.round(((deg % 360) + 360) % 360 / 45) % 8
  return POINTS[i]
}
