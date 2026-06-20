import { describe, it, expect, vi, afterEach } from 'vitest'
import { photonSearchUrl, parsePhotonPlaces, fetchPhotonPlaces } from './photon'

/** Build a Photon GeoJSON feature with the given properties. */
const feature = (properties: Record<string, unknown>) => ({ type: 'Feature', properties })

describe('photonSearchUrl', () => {
  it('builds a Photon autocomplete URL with limit + lang', () => {
    const url = photonSearchUrl('Kyoto')
    expect(url).toContain('https://photon.komoot.io/api?')
    expect(url).toContain('q=Kyoto')
    expect(url).toContain('limit=6')
    expect(url).toContain('lang=en')
  })
  it('URL-encodes the query (spaces, punctuation)', () => {
    const url = photonSearchUrl('St. Louis, Missouri')
    expect(url).toContain('q=St.+Louis%2C+Missouri')
  })
})

describe('parsePhotonPlaces', () => {
  it('keeps place-level results and assembles a clean label', () => {
    const json = {
      features: [
        feature({ osm_value: 'city', name: 'St. Louis', state: 'Missouri', country: 'United States' }),
      ],
    }
    expect(parsePhotonPlaces(json)).toEqual(['St. Louis, Missouri, United States'])
  })

  it('matches place level via either osm_value or type', () => {
    const json = {
      features: [
        feature({ type: 'country', name: 'Japan', country: 'Japan' }),
        feature({ osm_value: 'town', name: 'Hakone', state: 'Kanagawa', country: 'Japan' }),
      ],
    }
    expect(parsePhotonPlaces(json)).toEqual(['Japan, Japan', 'Hakone, Kanagawa, Japan'])
  })

  it('drops missing label parts', () => {
    const json = { features: [feature({ osm_value: 'country', name: 'France', country: 'France' })] }
    expect(parsePhotonPlaces(json)).toEqual(['France, France'])
    const noMid = { features: [feature({ osm_value: 'city', name: 'Singapore', country: 'Singapore' })] }
    expect(parsePhotonPlaces(noMid)).toEqual(['Singapore, Singapore'])
  })

  it('falls back to state/region/county for the middle part', () => {
    const region = { features: [feature({ osm_value: 'city', name: 'A', region: 'R', country: 'C' })] }
    expect(parsePhotonPlaces(region)).toEqual(['A, R, C'])
    const county = { features: [feature({ osm_value: 'village', name: 'B', county: 'Cty', country: 'C' })] }
    expect(parsePhotonPlaces(county)).toEqual(['B, Cty, C'])
  })

  it('filters out non-place results (POIs, streets, addresses)', () => {
    const json = {
      features: [
        feature({ osm_value: 'restaurant', name: 'Some Cafe', city: 'Kyoto', country: 'Japan' }),
        feature({ osm_value: 'street', name: 'Main St', city: 'Kyoto', country: 'Japan' }),
        feature({ osm_value: 'city', name: 'Kyoto', country: 'Japan' }),
      ],
    }
    expect(parsePhotonPlaces(json)).toEqual(['Kyoto, Japan'])
  })

  it('de-dupes case-insensitively, keeping first-seen', () => {
    const json = {
      features: [
        feature({ osm_value: 'city', name: 'Paris', state: 'Île-de-France', country: 'France' }),
        feature({ osm_value: 'city', name: 'paris', state: 'île-de-france', country: 'france' }),
      ],
    }
    expect(parsePhotonPlaces(json)).toEqual(['Paris, Île-de-France, France'])
  })

  it('returns [] for garbage / wrong-shaped input', () => {
    expect(parsePhotonPlaces(null)).toEqual([])
    expect(parsePhotonPlaces(undefined)).toEqual([])
    expect(parsePhotonPlaces('nope')).toEqual([])
    expect(parsePhotonPlaces(42)).toEqual([])
    expect(parsePhotonPlaces({})).toEqual([])
    expect(parsePhotonPlaces({ features: 'bad' })).toEqual([])
    expect(parsePhotonPlaces({ features: [null, 7, {}] })).toEqual([])
    expect(parsePhotonPlaces({ features: [feature({ osm_value: 'city' })] })).toEqual([]) // no name
  })
})

describe('fetchPhotonPlaces', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns [] (no fetch) for an empty / whitespace query', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    expect(await fetchPhotonPlaces('   ')).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns parsed labels on a good response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ features: [feature({ osm_value: 'city', name: 'Kyoto', country: 'Japan' })] }),
    } as Response)
    expect(await fetchPhotonPlaces('Kyoto')).toEqual(['Kyoto, Japan'])
  })

  it('returns [] on a non-OK status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 500 } as Response)
    expect(await fetchPhotonPlaces('Anywhere')).toEqual([])
  })

  it('returns [] when fetch throws (network error / abort)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('aborted'))
    expect(await fetchPhotonPlaces('Anywhere')).toEqual([])
  })
})
