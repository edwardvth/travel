import { describe, it, expect } from 'vitest'
import { haversineKm, walkMinutes, stopCoords, formatWalk } from './walk'

describe('haversineKm', () => {
  it('is zero for identical points', () => {
    expect(haversineKm({ lat: 48.8584, lng: 2.2945 }, { lat: 48.8584, lng: 2.2945 })).toBe(0)
  })

  it('matches a known short distance (Eiffel Tower → Arc de Triomphe ≈ 2.05 km)', () => {
    const km = haversineKm({ lat: 48.8584, lng: 2.2945 }, { lat: 48.8738, lng: 2.295 })
    expect(km).toBeGreaterThan(1.6)
    expect(km).toBeLessThan(1.8)
  })

  it('matches a known long distance (Paris → London ≈ 344 km)', () => {
    const km = haversineKm({ lat: 48.8566, lng: 2.3522 }, { lat: 51.5074, lng: -0.1278 })
    expect(km).toBeGreaterThan(330)
    expect(km).toBeLessThan(360)
  })

  it('is symmetric', () => {
    const a = { lat: 40.7128, lng: -74.006 }
    const b = { lat: 34.0522, lng: -118.2437 }
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 6)
  })

  it('measures one degree of latitude as ≈ 111 km', () => {
    const km = haversineKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })
    expect(km).toBeGreaterThan(110)
    expect(km).toBeLessThan(112)
  })
})

describe('walkMinutes', () => {
  it('floors at 1 minute for near-identical points', () => {
    expect(walkMinutes({ lat: 48.8584, lng: 2.2945 }, { lat: 48.8584, lng: 2.2946 })).toBe(1)
  })

  it('is exactly 1 for identical points (never 0)', () => {
    expect(walkMinutes({ lat: 0, lng: 0 }, { lat: 0, lng: 0 })).toBe(1)
  })

  it('rounds to the nearest minute (1 km @ 4.8 km/h ≈ 12.5 → 13 min)', () => {
    // ~1 km north of equator.
    const mins = walkMinutes({ lat: 0, lng: 0 }, { lat: 0.009, lng: 0 })
    expect(mins).toBe(13)
  })

  it('grows with distance', () => {
    const a = { lat: 0, lng: 0 }
    const near = walkMinutes(a, { lat: 0.005, lng: 0 })
    const far = walkMinutes(a, { lat: 0.02, lng: 0 })
    expect(far).toBeGreaterThan(near)
  })
})

describe('stopCoords', () => {
  it('reads flat lat/lng', () => {
    expect(stopCoords({ lat: 1, lng: 2 })).toEqual({ lat: 1, lng: 2 })
  })

  it('reads nested coords when flat are absent', () => {
    expect(stopCoords({ coords: { lat: 3, lng: 4 } })).toEqual({ lat: 3, lng: 4 })
  })

  it('prefers flat lat/lng over nested coords', () => {
    expect(stopCoords({ lat: 1, lng: 2, coords: { lat: 3, lng: 4 } })).toEqual({ lat: 1, lng: 2 })
  })

  it('returns null when no coords at all', () => {
    expect(stopCoords({})).toBeNull()
  })

  it('returns null for non-finite values', () => {
    expect(stopCoords({ lat: NaN, lng: 2 })).toBeNull()
    expect(stopCoords({ lat: 1, lng: Infinity })).toBeNull()
  })

  it('returns null when only one coordinate is present', () => {
    expect(stopCoords({ lat: 1 })).toBeNull()
    expect(stopCoords({ coords: { lat: 3 } as { lat: number; lng: number } })).toBeNull()
  })

  it('accepts 0/0 as valid finite coords', () => {
    expect(stopCoords({ lat: 0, lng: 0 })).toEqual({ lat: 0, lng: 0 })
  })
})

describe('formatWalk', () => {
  it('shows minutes under an hour', () => {
    expect(formatWalk(12)).toBe('12 min walk')
    expect(formatWalk(1)).toBe('1 min walk')
    expect(formatWalk(59)).toBe('59 min walk')
  })

  it('floors at 1 minute', () => {
    expect(formatWalk(0)).toBe('1 min walk')
  })

  it('shows whole hours with no remainder', () => {
    expect(formatWalk(60)).toBe('1 h walk')
    expect(formatWalk(120)).toBe('2 h walk')
  })

  it('shows hours and minutes beyond 60', () => {
    expect(formatWalk(65)).toBe('1 h 5 min walk')
    expect(formatWalk(135)).toBe('2 h 15 min walk')
  })

  it('rounds fractional minutes before formatting', () => {
    expect(formatWalk(11.4)).toBe('11 min walk')
    expect(formatWalk(59.6)).toBe('1 h walk')
  })
})
