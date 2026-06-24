import { describe, it, expect } from 'vitest'
import type { Stop, TripConfig } from '../types'

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

describe('normalized-place fields', () => {
  it('accepts placeId/placeName/placeTypes/placeSource on a Stop', () => {
    const s: Stop = {
      name: 'Meet Sarah Here', // editable title differs from canonical
      placeId: 'ChIJxxxx',
      placeSource: 'google',
      placeName: 'Gateway Arch',
      placeTypes: ['tourist_attraction', 'point_of_interest'],
    }
    expect(s.placeId).toBe('ChIJxxxx')
    expect(s.placeName).toBe('Gateway Arch')
    expect(s.placeTypes).toContain('tourist_attraction')
  })
  it('accepts destinationGeo on TripConfig', () => {
    const c: TripConfig = { destinationGeo: { lat: 38.62, lng: -90.19, countryCode: 'us', state: 'Missouri' } }
    expect(c.destinationGeo?.countryCode).toBe('us')
  })
})
