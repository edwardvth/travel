export type Platform = 'ios' | 'android' | 'desktop'

export interface DirectionsTarget {
  name: string
  destination?: string
  coords?: { lat: number; lng: number }
}

/** Detect the platform from the UA (browser-only; defaults to 'desktop'). */
export function detectPlatform(ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''): Platform {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'desktop'
}

/**
 * Build a "Directions" URL that opens the device's DEFAULT maps app. No embedded
 * map, no provider menu (locked product decision). Coordinate-less stops fall
 * back to a name+destination text query. Pure + tested.
 */
export function directionsUrl(t: DirectionsTarget, platform: Platform): string {
  const enc = encodeURIComponent
  if (t.coords) {
    const { lat, lng } = t.coords
    if (platform === 'ios') return `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=w`
    if (platform === 'android') return `geo:${lat},${lng}?q=${lat},${lng}(${enc(t.name)})`
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`
  }
  const q = enc([t.name, t.destination].filter(Boolean).join(', '))
  if (platform === 'ios') return `https://maps.apple.com/?q=${q}`
  if (platform === 'android') return `geo:0,0?q=${q}`
  return `https://www.google.com/maps/search/?api=1&query=${q}`
}
