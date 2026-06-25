/**
 * Geographic coordinates for the hero Explorer map nodes.
 *
 * One entry per HERO_DESTINATIONS term (names must match exactly so the
 * Explorer can light the node for the currently-typed destination). Coords are
 * real-world lat/lng; the map uses a plain equirectangular projection.
 */

export interface City {
  name: string
  lat: number
  lng: number
}

export const CITIES: City[] = [
  { name: 'Yerevan', lat: 40.18, lng: 44.51 },
  { name: 'Rio de Janeiro', lat: -22.91, lng: -43.17 },
  { name: 'Kyoto', lat: 35.01, lng: 135.77 },
  { name: 'Tokyo', lat: 35.68, lng: 139.65 },
  { name: 'Paris', lat: 48.8566, lng: 2.3522 },
  { name: 'Dubai', lat: 25.2, lng: 55.27 },
  { name: 'Milan', lat: 45.46, lng: 9.19 },
  { name: 'Singapore', lat: 1.35, lng: 103.82 },
  { name: 'Santorini', lat: 36.39, lng: 25.46 },
  { name: 'Positano', lat: 40.6281, lng: 14.4848 },
  { name: 'Banff', lat: 51.18, lng: -115.57 },
  { name: 'Patagonia', lat: -49.33, lng: -72.89 },
  { name: 'Swiss Alps', lat: 46.56, lng: 8.56 },
]

/**
 * Equirectangular projection of a lat/lng onto a `w`×`h` canvas.
 *   x = (lng + 180) / 360 * w   — lng -180..180 maps left..right
 *   y = (90 - lat) / 180 * h     — lat +90..-90 maps top..bottom
 * So (lat 0, lng 0) lands at the exact center.
 */
export function project(
  lat: number,
  lng: number,
  w: number,
  h: number,
): { x: number; y: number } {
  return {
    x: ((lng + 180) / 360) * w,
    y: ((90 - lat) / 180) * h,
  }
}
