import { describe, it, expect, vi, afterEach } from 'vitest'
import { geocodeUrl, parseGeocode, geocodePlace } from './geocode'

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
