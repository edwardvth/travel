import { describe, it, expect, vi, afterEach } from 'vitest'
import { parseRegion, resolveRegion, biasCenter } from './region'
import type { Trip } from '../types'

const feat = (coordinates: number[], properties: Record<string, unknown>) =>
  ({ geometry: { coordinates }, properties })

describe('parseRegion', () => {
  it('reads center + lowercased countrycode + state (US)', () => {
    const json = { features: [feat([-90.19, 38.62], { countrycode: 'US', state: 'Missouri', name: 'St. Louis' })] }
    expect(parseRegion(json)).toEqual({ lat: 38.62, lng: -90.19, countryCode: 'us', state: 'Missouri' })
  })
  it('omits state when absent (non-US)', () => {
    const json = { features: [feat([139.7, 35.68], { countrycode: 'JP', name: 'Tokyo' })] }
    expect(parseRegion(json)).toEqual({ lat: 35.68, lng: 139.7, countryCode: 'jp' })
  })
  it('keeps center with empty countryCode when countrycode missing', () => {
    const json = { features: [feat([2.35, 48.85], { name: 'Somewhere' })] }
    expect(parseRegion(json)).toEqual({ lat: 48.85, lng: 2.35, countryCode: '' })
  })
  it('returns null for garbage / no features / bad coords', () => {
    expect(parseRegion(null)).toBeNull()
    expect(parseRegion({ features: [] })).toBeNull()
    expect(parseRegion({ features: [feat(['x' as unknown as number, 1], {})] })).toBeNull()
  })
})

describe('resolveRegion', () => {
  afterEach(() => vi.restoreAllMocks())
  it('returns null (no fetch) for empty input', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    expect(await resolveRegion('  ')).toBeNull()
    expect(spy).not.toHaveBeenCalled()
  })
  it('parses a good Photon response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true, json: async () => ({ features: [feat([-90.19, 38.62], { countrycode: 'US', state: 'Missouri' })] }),
    } as Response)
    expect(await resolveRegion('St. Louis, Missouri, United States')).toEqual({ lat: 38.62, lng: -90.19, countryCode: 'us', state: 'Missouri' })
  })
  it('returns null on non-OK / throw', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 500 } as Response)
    expect(await resolveRegion('X')).toBeNull()
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('net'))
    expect(await resolveRegion('X')).toBeNull()
  })
})

const mkTrip = (days: Array<Array<{ lat?: number; lng?: number }>>, destinationGeo?: Trip['config']['destinationGeo']): Trip =>
  ({ id: 't', owner_id: null, title: 'T', subtitle: null,
     config: { destinationGeo },
     data: { days: days.map(stops => ({ title: '', stops: stops.map((s, i) => ({ name: 'S' + i, ...s })) })), completed: [] } }) as Trip

describe('biasCenter', () => {
  it('1) uses the most recent coord stop in the current day', () => {
    const t = mkTrip([[{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }]])
    expect(biasCenter(t, 0)).toEqual({ lat: 2, lng: 2 })
  })
  it('2) falls back to the most recent coord stop anywhere when the day has none', () => {
    const t = mkTrip([[{ lat: 5, lng: 5 }], [{}]]) // day 1 has a no-coord stop
    expect(biasCenter(t, 1)).toEqual({ lat: 5, lng: 5 })
  })
  it('3) falls back to destinationGeo when no stop has coords', () => {
    const t = mkTrip([[{}]], { lat: 9, lng: 9, countryCode: 'us' })
    expect(biasCenter(t, 0)).toEqual({ lat: 9, lng: 9 })
  })
  it('returns undefined when nothing is available', () => {
    expect(biasCenter(mkTrip([[]]), 0)).toBeUndefined()
  })
})
