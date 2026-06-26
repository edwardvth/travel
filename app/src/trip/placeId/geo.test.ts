import { describe, it, expect } from 'vitest'
import { distanceMeters } from './geo'

describe('distanceMeters', () => {
  it('is ~0 for identical points', () => {
    expect(distanceMeters({ lat: 38.6, lng: -90.18 }, { lat: 38.6, lng: -90.18 })).toBeLessThan(1)
  })

  it('matches a known short distance (~111m per 0.001° lat)', () => {
    const d = distanceMeters({ lat: 38.600, lng: -90.180 }, { lat: 38.601, lng: -90.180 })
    expect(d).toBeGreaterThan(105)
    expect(d).toBeLessThan(118)
  })

  it('matches a known longer distance (Arch ↔ Union Station ~2.5km)', () => {
    const d = distanceMeters({ lat: 38.6247, lng: -90.1848 }, { lat: 38.6270, lng: -90.2070 })
    expect(d).toBeGreaterThan(1800)
    expect(d).toBeLessThan(2200)
  })
})
