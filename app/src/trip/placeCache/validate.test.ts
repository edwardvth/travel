import { describe, it, expect } from 'vitest'
import { isValidPlaceIdShape, validatePlaceRequest } from './validate'

describe('isValidPlaceIdShape', () => {
  it('accepts Google-shaped ids and rejects junk', () => {
    expect(isValidPlaceIdShape('ChIJteVBdWDwwIcRNKiWxoko7Xk')).toBe(true)
    expect(isValidPlaceIdShape('short')).toBe(false)
    expect(isValidPlaceIdShape('bad id with spaces!!')).toBe(false)
    expect(isValidPlaceIdShape('')).toBe(false)
  })
})

describe('validatePlaceRequest', () => {
  it('passes a well-formed request', () => {
    const r = validatePlaceRequest({ placeId: 'ChIJteVBdWDwwIcRNKiWxoko7Xk', name: 'Gateway Arch', coords: { lat: 38.6, lng: -90.2 } })
    expect(r.ok).toBe(true)
  })
  it('rejects bad placeId shape', () => {
    expect(validatePlaceRequest({ placeId: 'nope', name: 'X' }).ok).toBe(false)
  })
  it('rejects an empty name', () => {
    expect(validatePlaceRequest({ placeId: 'ChIJteVBdWDwwIcRNKiWxoko7Xk', name: '   ' }).ok).toBe(false)
  })
  it('rejects out-of-range coordinates', () => {
    expect(validatePlaceRequest({ placeId: 'ChIJteVBdWDwwIcRNKiWxoko7Xk', name: 'X', coords: { lat: 200, lng: 0 } }).ok).toBe(false)
  })
})
