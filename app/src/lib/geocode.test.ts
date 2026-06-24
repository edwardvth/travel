import { describe, it, expect, vi, afterEach } from 'vitest'
import { geocodeUrl, parseGeocode, geocodePlace, canApplyGeocode, findStopByPlaceId, canApplyPlaceDetails } from './geocode'
import type { Trip } from '../types'

/** A Photon point feature with geometry + properties. */
const feat = (lng: number, lat: number, properties: Record<string, unknown> = {}) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [lng, lat] },
  properties,
})

describe('geocodeUrl', () => {
  it('URL-encodes the query, caps limit, asks English', () => {
    const url = geocodeUrl('Eiffel Tower')
    expect(url).toContain('https://photon.komoot.io/api?')
    expect(url).toContain('q=Eiffel+Tower')
    expect(url).toContain('limit=1')
    expect(url).toContain('lang=en')
  })

  it('appends the `near` bias into the query (disambiguation)', () => {
    const url = geocodeUrl('Trastevere', 'Rome, Italy')
    expect(url).toContain('q=Trastevere%2C+Rome%2C+Italy')
  })
})

describe('parseGeocode', () => {
  it('reads lng,lat from the first feature geometry (note GeoJSON order)', () => {
    expect(parseGeocode({ features: [feat(2.2945, 48.8584)] })).toEqual({
      lat: 48.8584,
      lng: 2.2945,
    })
  })

  it('assembles an address label when present', () => {
    const json = {
      features: [feat(-0.1, 51.5, { name: 'Tate Modern', street: 'Bankside', city: 'London', country: 'UK' })],
    }
    expect(parseGeocode(json)).toEqual({
      lat: 51.5,
      lng: -0.1,
      address: 'Bankside, London, UK',
    })
  })

  it('returns null for a miss / garbage / non-finite coords', () => {
    expect(parseGeocode({ features: [] })).toBeNull()
    expect(parseGeocode(null)).toBeNull()
    expect(parseGeocode('nope')).toBeNull()
    expect(parseGeocode({ features: [{ geometry: { coordinates: ['x', 'y'] } }] })).toBeNull()
    expect(parseGeocode({ features: [{ properties: {} }] })).toBeNull() // no geometry
  })
})

describe('geocodePlace', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns null (no fetch) for an empty / whitespace query', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    expect(await geocodePlace('   ')).toBeNull()
    expect(spy).not.toHaveBeenCalled()
  })

  it('resolves coords on a good response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ features: [feat(2.2945, 48.8584, { name: 'Eiffel Tower' })] }),
    } as Response)
    expect(await geocodePlace('Eiffel Tower')).toMatchObject({ lat: 48.8584, lng: 2.2945 })
  })

  it('biases the request URL with `near`', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ features: [feat(12.46, 41.89)] }),
    } as Response)
    await geocodePlace('Trastevere', 'Rome, Italy')
    const calledUrl = String((spy.mock.calls[0] ?? [])[0])
    expect(calledUrl).toContain('Trastevere')
    expect(calledUrl).toContain('Rome')
  })

  it('returns null on a non-OK status (miss)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 500 } as Response)
    expect(await geocodePlace('Nowhere')).toBeNull()
  })

  it('returns null when fetch throws (network error) — never throws', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'))
    await expect(geocodePlace('Nowhere')).resolves.toBeNull()
  })
})

describe('canApplyGeocode (stale-write guard, last-write-wins)', () => {
  const origin = { name: 'Trastevere', address: 'Rome' }

  it('applies when the stop still lacks coords and still matches the query', () => {
    expect(canApplyGeocode({ name: 'Trastevere', address: 'Rome' }, origin)).toBe(true)
  })

  it('discards when the stop already gained coords (flat)', () => {
    expect(canApplyGeocode({ name: 'Trastevere', address: 'Rome', lat: 41.8, lng: 12.4 }, origin)).toBe(false)
  })

  it('discards when the stop already gained coords (nested)', () => {
    expect(
      canApplyGeocode({ name: 'Trastevere', address: 'Rome', coords: { lat: 41.8, lng: 12.4 } }, origin),
    ).toBe(false)
  })

  it('discards when the user relocated to a different name (race)', () => {
    expect(canApplyGeocode({ name: 'Colosseum', address: 'Rome' }, origin)).toBe(false)
  })

  it('discards when the address changed', () => {
    expect(canApplyGeocode({ name: 'Trastevere', address: 'Florence' }, origin)).toBe(false)
  })

  it('matches when neither has an address (typed name only)', () => {
    expect(canApplyGeocode({ name: 'Foo' }, { name: 'Foo' })).toBe(true)
  })

  it('discards a zero/non-finite placeholder coord as "no coords" → still applies', () => {
    expect(canApplyGeocode({ name: 'Foo', lat: 0, lng: 0 }, { name: 'Foo' })).toBe(true)
  })
})

const trip = (): Trip => ({ id: 't', owner_id: null, title: 'T', subtitle: null, config: {},
  data: { days: [{ title: '', stops: [{ name: 'A' }, { name: 'Arch', placeId: 'p1' }] }], completed: [] } }) as Trip

describe('findStopByPlaceId', () => {
  it('locates a stop by placeId', () => {
    expect(findStopByPlaceId(trip(), 'p1')).toMatchObject({ dayIndex: 0, stopIndex: 1 })
  })
  it('returns null when absent', () => {
    expect(findStopByPlaceId(trip(), 'nope')).toBeNull()
  })
  it('returns the most recently added match when the place appears twice', () => {
    const dup: Trip = { id: 't', owner_id: null, title: 'T', subtitle: null, config: {},
      data: { days: [
        { title: '', stops: [{ name: 'Cascade (Mon)', placeId: 'p1' }] },
        { title: '', stops: [{ name: 'Other' }, { name: 'Cascade (Tue)', placeId: 'p1' }] },
      ], completed: [] } } as Trip
    expect(findStopByPlaceId(dup, 'p1')).toMatchObject({ dayIndex: 1, stopIndex: 1 })
  })
})

describe('canApplyPlaceDetails', () => {
  it('applies only when the stop exists and placeId matches', () => {
    expect(canApplyPlaceDetails({ placeId: 'p1' }, 'p1')).toBe(true)
    expect(canApplyPlaceDetails({ placeId: 'p2' }, 'p1')).toBe(false)
    expect(canApplyPlaceDetails(null, 'p1')).toBe(false)
    expect(canApplyPlaceDetails(undefined, 'p1')).toBe(false)
  })
})
