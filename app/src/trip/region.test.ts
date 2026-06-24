import { describe, it, expect, vi, afterEach } from 'vitest'
import { parseRegion, resolveRegion } from './region'

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
