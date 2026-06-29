import { describe, it, expect } from 'vitest'
import { mapGooglePrice } from './placeDetails'

describe('mapGooglePrice', () => {
  it('maps the Google enum to canonical symbols', () => {
    expect(mapGooglePrice('PRICE_LEVEL_INEXPENSIVE')).toBe('$')
    expect(mapGooglePrice('PRICE_LEVEL_MODERATE')).toBe('$$')
    expect(mapGooglePrice('PRICE_LEVEL_EXPENSIVE')).toBe('$$$')
    expect(mapGooglePrice('PRICE_LEVEL_VERY_EXPENSIVE')).toBe('$$$$')
  })
  it('returns undefined for free / unspecified / unknown / empty', () => {
    expect(mapGooglePrice('PRICE_LEVEL_FREE')).toBeUndefined()
    expect(mapGooglePrice('PRICE_LEVEL_UNSPECIFIED')).toBeUndefined()
    expect(mapGooglePrice('')).toBeUndefined()
    expect(mapGooglePrice(null)).toBeUndefined()
    expect(mapGooglePrice('garbage')).toBeUndefined()
  })
})
