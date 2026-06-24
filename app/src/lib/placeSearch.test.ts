import { describe, it, expect } from 'vitest'
import { buildAutocompleteBody, parsePredictions, parseDetails } from './placeSearch'

describe('buildAutocompleteBody', () => {
  it('includes input/sessionToken/lang + country + 50km circle bias', () => {
    const b = buildAutocompleteBody('gate', 'tok-1', { countryCode: 'us', lat: 38.6, lng: -90.2 })
    expect(b).toMatchObject({
      input: 'gate', sessionToken: 'tok-1', languageCode: 'en',
      includedRegionCodes: ['us'],
      locationBias: { circle: { center: { latitude: 38.6, longitude: -90.2 }, radius: 50000 } },
    })
  })
  it('omits includedRegionCodes when countryCode is empty, and locationBias when no center', () => {
    const b = buildAutocompleteBody('gate', 'tok-1', { countryCode: '' })
    expect(b).not.toHaveProperty('includedRegionCodes')
    expect(b).not.toHaveProperty('locationBias')
  })
})

describe('parsePredictions', () => {
  it('maps Google suggestions to {placeId,primaryText,secondaryText,types}', () => {
    const json = { suggestions: [
      { placePrediction: { placeId: 'p1',
        structuredFormat: { mainText: { text: 'Gateway Arch' }, secondaryText: { text: 'St. Louis, MO' } },
        types: ['tourist_attraction'] } },
      { queryPrediction: { text: { text: 'ignored' } } }, // non-place prediction → dropped
    ] }
    expect(parsePredictions(json)).toEqual([
      { placeId: 'p1', primaryText: 'Gateway Arch', secondaryText: 'St. Louis, MO', types: ['tourist_attraction'] },
    ])
  })
  it('returns [] for garbage', () => {
    expect(parsePredictions(null)).toEqual([])
    expect(parsePredictions({})).toEqual([])
    expect(parsePredictions({ suggestions: 'no' })).toEqual([])
  })
})

describe('parseDetails', () => {
  it('maps Google place to {name,lat,lng,address,types}', () => {
    const json = { location: { latitude: 38.62, longitude: -90.18 },
      formattedAddress: '11 N 4th St, St. Louis, MO', displayName: { text: 'Gateway Arch' },
      types: ['tourist_attraction'] }
    expect(parseDetails(json)).toEqual({
      name: 'Gateway Arch', lat: 38.62, lng: -90.18, address: '11 N 4th St, St. Louis, MO', types: ['tourist_attraction'],
    })
  })
  it('returns null without finite coords', () => {
    expect(parseDetails({ displayName: { text: 'X' } })).toBeNull()
    expect(parseDetails(null)).toBeNull()
  })
})
