import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildAutocompleteBody, parsePredictions, parseDetails, fetchPredictions, fetchPlaceDetails } from './placeSearch'

vi.mock('./supabase', () => ({
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}))

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
  it('omits the address key when formattedAddress is absent or empty', () => {
    const r = parseDetails({ location: { latitude: 1, longitude: 2 }, displayName: { text: 'X' }, types: [] })
    expect(r).not.toHaveProperty('address')
  })
})

describe('fetchPredictions', () => {
  afterEach(() => vi.restoreAllMocks())
  it('returns [] (no fetch) under 1 char', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    expect(await fetchPredictions('', 'tok', { countryCode: 'us' })).toEqual([])
    expect(spy).not.toHaveBeenCalled()
  })
  it('POSTs action:autocomplete and parses suggestions', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true, json: async () => ({ suggestions: [{ placePrediction: { placeId: 'p1', structuredFormat: { mainText: { text: 'Gateway Arch' } }, types: [] } }] }),
    } as Response)
    const out = await fetchPredictions('gate', 'tok', { countryCode: 'us', lat: 1, lng: 2 })
    expect(out).toEqual([{ placeId: 'p1', primaryText: 'Gateway Arch', secondaryText: '', types: [] }])
    const body = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string)
    expect(body.action).toBe('autocomplete')
    expect(body.body.input).toBe('gate')
  })
  it('returns [] on non-OK / throw', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false } as Response)
    expect(await fetchPredictions('gate', 'tok', { countryCode: 'us' })).toEqual([])
  })
})

describe('fetchPlaceDetails', () => {
  afterEach(() => vi.restoreAllMocks())
  it('POSTs action:details and parses the place', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true, json: async () => ({ location: { latitude: 1, longitude: 2 }, displayName: { text: 'X' }, types: [] }),
    } as Response)
    expect(await fetchPlaceDetails('p1', 'tok')).toEqual({ name: 'X', lat: 1, lng: 2, types: [] })
  })
  it('returns null on miss', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({}) } as Response)
    expect(await fetchPlaceDetails('p1', 'tok')).toBeNull()
  })
})
