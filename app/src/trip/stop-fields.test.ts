import { describe, it, expect } from 'vitest'
import type { Stop } from '../types'

describe('Stop coordinate-provenance fields (Tier 1)', () => {
  it('accepts coordinateSource and locationEditedAt', () => {
    const s: Stop = {
      name: 'X',
      lat: 1,
      lng: 2,
      coordinateSource: 'geocoder',
      locationEditedAt: '2026-06-22T10:00:00.000Z',
    }
    expect(s.coordinateSource).toBe('geocoder')
    expect(s.locationEditedAt).toBe('2026-06-22T10:00:00.000Z')
  })

  it('allows the ai origin and omitting both (back-compat)', () => {
    const ai: Stop = { name: 'Y', coordinateSource: 'ai' }
    const legacy: Stop = { name: 'Z' }
    expect(ai.coordinateSource).toBe('ai')
    expect(legacy.coordinateSource).toBeUndefined()
    expect(legacy.locationEditedAt).toBeUndefined()
  })
})
