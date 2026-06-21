import { describe, it, expect } from 'vitest'
import { bearing, compassLabel } from './geo'

describe('bearing', () => {
  it('returns ~0° for due north', () => {
    expect(bearing({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(0, 0)
  })
  it('returns ~90° for due east', () => {
    expect(bearing({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(90, 0)
  })
  it('returns ~180° for due south', () => {
    expect(bearing({ lat: 1, lng: 0 }, { lat: 0, lng: 0 })).toBeCloseTo(180, 0)
  })
  it('normalizes into [0,360)', () => {
    const b = bearing({ lat: 0, lng: 0 }, { lat: -1, lng: -0.0001 })
    expect(b).toBeGreaterThanOrEqual(0)
    expect(b).toBeLessThan(360)
  })
})

describe('compassLabel', () => {
  it('maps degrees to 8-point labels', () => {
    expect(compassLabel(0)).toBe('N')
    expect(compassLabel(45)).toBe('NE')
    expect(compassLabel(90)).toBe('E')
    expect(compassLabel(225)).toBe('SW')
    expect(compassLabel(359)).toBe('N')
  })
})
