import { describe, it, expect } from 'vitest'
import { normalizeHotel, hotelCoords } from './hotel'

describe('normalizeHotel', () => {
  it('turns a bare string into { name }', () => {
    expect(normalizeHotel('Hotel Edison')).toEqual({ name: 'Hotel Edison' })
  })

  it('trims a string and drops empty/whitespace to null', () => {
    expect(normalizeHotel('  Park Hyatt  ')).toEqual({ name: 'Park Hyatt' })
    expect(normalizeHotel('   ')).toBeNull()
    expect(normalizeHotel('')).toBeNull()
  })

  it('passes a full object through, keeping known fields', () => {
    expect(
      normalizeHotel({ name: 'H', address: '1 St', note: 'check-in 3pm', lat: 40.1, lng: -74.2 }),
    ).toEqual({ name: 'H', address: '1 St', note: 'check-in 3pm', lat: 40.1, lng: -74.2 })
  })

  it('keeps a partial object (name only)', () => {
    expect(normalizeHotel({ name: 'H' })).toEqual({ name: 'H' })
  })

  it('keeps check-in / check-out date strings', () => {
    expect(
      normalizeHotel({ name: 'H', checkIn: '2026-07-02', checkOut: '2026-07-05' }),
    ).toEqual({ name: 'H', checkIn: '2026-07-02', checkOut: '2026-07-05' })
  })

  it('trims and omits empty/whitespace check-in / check-out', () => {
    expect(normalizeHotel({ name: 'H', checkIn: '  ', checkOut: '' })).toEqual({ name: 'H' })
    expect(normalizeHotel({ name: 'H', checkIn: '  2026-07-02 ' })).toEqual({ name: 'H', checkIn: '2026-07-02' })
  })

  it('treats dates-only (no text) as null — nothing meaningful to show', () => {
    expect(normalizeHotel({ checkIn: '2026-07-02', checkOut: '2026-07-05' })).toBeNull()
  })

  it('ignores non-string check-in / check-out', () => {
    expect(normalizeHotel({ name: 'H', checkIn: 20260702 as unknown as string })).toEqual({ name: 'H' })
  })

  it('drops non-finite or non-numeric coords', () => {
    expect(normalizeHotel({ name: 'H', lat: NaN, lng: 5 })).toEqual({ name: 'H', lng: 5 })
    expect(normalizeHotel({ name: 'H', lat: '40' as unknown as number })).toEqual({ name: 'H' })
  })

  it('trims string fields and omits empties', () => {
    expect(normalizeHotel({ name: '  H  ', address: '   ', note: '' })).toEqual({ name: 'H' })
  })

  it('returns null for null/undefined/empty object', () => {
    expect(normalizeHotel(null)).toBeNull()
    expect(normalizeHotel(undefined)).toBeNull()
    expect(normalizeHotel({})).toBeNull()
  })

  it('treats coords-only (no text) as null — nothing meaningful to show', () => {
    expect(normalizeHotel({ lat: 40, lng: -74 })).toBeNull()
  })

  it('ignores unknown/non-object inputs', () => {
    expect(normalizeHotel(42)).toBeNull()
    expect(normalizeHotel(true)).toBeNull()
  })
})

describe('hotelCoords', () => {
  it('returns finite coords when present', () => {
    expect(hotelCoords({ name: 'H', lat: 40, lng: -74 })).toEqual({ lat: 40, lng: -74 })
  })

  it('returns null without both coords', () => {
    expect(hotelCoords({ name: 'H' })).toBeNull()
    expect(hotelCoords({ name: 'H', lat: 40 })).toBeNull()
    expect(hotelCoords(null)).toBeNull()
  })
})
