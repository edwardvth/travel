import { describe, it, expect } from 'vitest'
import { stylizedPath } from './minimap-geom'

const A = { lat: 38.6247, lng: -90.1848 } // user
const B = { lat: 38.6270, lng: -90.1994 } // destination

describe('stylizedPath', () => {
  it('starts at the user and ends at the destination', () => {
    const p = stylizedPath(A, B)
    expect(p[0].lat).toBeCloseTo(A.lat, 9)
    expect(p[0].lng).toBeCloseTo(A.lng, 9)
    expect(p[p.length - 1].lat).toBeCloseTo(B.lat, 9)
    expect(p[p.length - 1].lng).toBeCloseTo(B.lng, 9)
  })

  it('returns segments+1 points (default 25)', () => {
    expect(stylizedPath(A, B)).toHaveLength(25)
    expect(stylizedPath(A, B, 0.12, 10)).toHaveLength(11)
  })

  it('bows off the straight line (the midpoint is offset, not collinear)', () => {
    const p = stylizedPath(A, B)
    const mid = p[Math.floor(p.length / 2)]
    const straightLat = (A.lat + B.lat) / 2
    const straightLng = (A.lng + B.lng) / 2
    // The curved midpoint is measurably off the straight midpoint.
    const off = Math.hypot(mid.lat - straightLat, mid.lng - straightLng)
    expect(off).toBeGreaterThan(1e-4)
  })

  it('collapses to the point when user and destination coincide', () => {
    const p = stylizedPath(A, A)
    expect(p[0].lat).toBeCloseTo(A.lat, 9)
    expect(p[12].lat).toBeCloseTo(A.lat, 9)
    expect(p[p.length - 1].lng).toBeCloseTo(A.lng, 9)
  })

  it('does not mutate its inputs', () => {
    const a = { ...A }, b = { ...B }
    stylizedPath(a, b)
    expect(a).toEqual(A)
    expect(b).toEqual(B)
  })
})
