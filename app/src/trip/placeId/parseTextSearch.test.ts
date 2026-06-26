import { describe, it, expect } from 'vitest'
import { parseTextSearch } from './parseTextSearch'

const place = (over: Record<string, unknown> = {}) => ({
  id: 'ChIJyWEHuEmuEmsRm9hTkapTCrk',
  displayName: { text: 'Gateway Arch' },
  formattedAddress: 'St. Louis, MO 63102, USA',
  location: { latitude: 38.6247, longitude: -90.1848 },
  types: ['tourist_attraction', 'park'],
  ...over,
})

describe('parseTextSearch', () => {
  it('maps places to candidates, preserving Google order + types', () => {
    const out = parseTextSearch({ places: [place(), place({ id: 'p2', displayName: { text: 'B' } })] })
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({
      placeId: 'ChIJyWEHuEmuEmsRm9hTkapTCrk',
      name: 'Gateway Arch',
      address: 'St. Louis, MO 63102, USA',
      lat: 38.6247, lng: -90.1848,
      types: ['tourist_attraction', 'park'],
    })
    expect(out[1].placeId).toBe('p2') // order preserved
  })

  it('caps to MAX_REVIEW_CANDIDATES', () => {
    const many = Array.from({ length: 7 }, (_, i) => place({ id: `p${i}` }))
    expect(parseTextSearch({ places: many })).toHaveLength(3)
  })

  it('drops entries with no id or no name', () => {
    const out = parseTextSearch({ places: [place({ id: '' }), place({ displayName: {} }), place({ id: 'ok' })] })
    expect(out.map(c => c.placeId)).toEqual(['ok'])
  })

  it('tolerates missing location/address/types', () => {
    const out = parseTextSearch({ places: [{ id: 'x', displayName: { text: 'X' } }] })
    expect(out[0]).toMatchObject({ placeId: 'x', name: 'X', types: [] })
    expect(out[0].lat).toBeUndefined()
    expect(out[0].address).toBeUndefined()
  })

  it('returns [] on garbage', () => {
    expect(parseTextSearch(null)).toEqual([])
    expect(parseTextSearch('nope')).toEqual([])
    expect(parseTextSearch({})).toEqual([])
    expect(parseTextSearch({ places: 'x' })).toEqual([])
  })
})
