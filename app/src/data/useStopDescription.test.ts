import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stopHasDescription, stopDescriptionKey, applyStopDescription, runGenerate } from './useStopDescription'
import { fetchPlaceDescription } from '../lib/enrichClient'
import { generateStopDetail } from '../trip/enrich'
import type { Stop, TripData } from '../types'
import type { StopDetailContent } from '../trip/enrich'

vi.mock('../lib/enrichClient', () => ({ fetchPlaceDescription: vi.fn() }))
vi.mock('../trip/enrich', () => ({ generateStopDetail: vi.fn() }))

const stop = (p: Partial<Stop>): Stop => ({ name: 'Place', ...p })
const content: StopDetailContent = { history: 'H', facts: ['f1'], tips: 'T', notice: '', goodFor: '' }

describe('stopHasDescription', () => {
  it('is false when the stop has no content', () => expect(stopHasDescription(stop({}))).toBe(false))
  it('is true with history', () => expect(stopHasDescription(stop({ history: 'x' }))).toBe(true))
  it('is true with facts', () => expect(stopHasDescription(stop({ facts: ['x'] }))).toBe(true))
  it('is true with tips', () => expect(stopHasDescription(stop({ tips: 'x' }))).toBe(true))
  it('is false for an empty facts array', () => expect(stopHasDescription(stop({ facts: [] }))).toBe(false))
})

describe('stopDescriptionKey', () => {
  it('prefers placeId over name', () => {
    expect(stopDescriptionKey(stop({ placeId: 'abc', name: 'Eiffel' }), 'Paris')).toBe('place:abc')
  })
  it('falls back to normalized name + destination', () => {
    expect(stopDescriptionKey(stop({ name: '  Eiffel  Tower ' }), 'Paris')).toContain('name:eiffel tower|paris')
  })
  it('includes rounded coords when present', () => {
    expect(stopDescriptionKey(stop({ name: 'A', lat: 48.8584, lng: 2.2945 }), 'Paris')).toContain('@48.858,2.295')
  })
  it('is case-insensitive on the name (same place → same key)', () => {
    expect(stopDescriptionKey(stop({ name: 'Louvre' }), 'Paris')).toBe(
      stopDescriptionKey(stop({ name: 'LOUVRE' }), 'Paris'),
    )
  })
})

describe('applyStopDescription', () => {
  const data = (): TripData => ({
    completed: [],
    days: [{ title: 'D1', stops: [stop({ name: 'Louvre' }), stop({ name: 'Eiffel', history: 'has' })] }],
  })

  it('patches the matching content-less stop by identity', () => {
    const d = data()
    const next = applyStopDescription(d, stopDescriptionKey(stop({ name: 'Louvre' }), 'Paris'), 'Paris', content)
    expect(next).not.toBe(d)
    expect(next.days[0].stops[0].history).toBe('H')
    expect(next.days[0].stops[0].facts).toEqual(['f1'])
    // The stop that already had content is untouched.
    expect(next.days[0].stops[1].history).toBe('has')
  })

  it('returns the same reference when no stop matches', () => {
    const d = data()
    expect(applyStopDescription(d, 'place:nope', 'Paris', content)).toBe(d)
  })

  it('never overwrites a stop that already has content', () => {
    const d = data()
    const key = stopDescriptionKey(stop({ name: 'Eiffel' }), 'Paris')
    expect(applyStopDescription(d, key, 'Paris', { history: 'NEW', facts: [], tips: '', notice: '', goodFor: '' })).toBe(d)
  })
})

describe('runGenerate — shared place-cache first, then local fallback', () => {
  const mockFetch = vi.mocked(fetchPlaceDescription)
  const mockGen = vi.mocked(generateStopDetail)
  const PID = 'ChIJabc123def4567890'

  beforeEach(() => { mockFetch.mockReset(); mockGen.mockReset() })

  it('serves a ready cache hit (incl. goodFor) without local generation', async () => {
    mockFetch.mockResolvedValue({ state: 'ready', content: { history: 'H', facts: ['f'], tips: 'T', notice: '', goodFor: 'Foodies' } })
    const out = await runGenerate(stop({ placeId: PID }), 'Trip', 'Paris')
    expect(out).toEqual({ history: 'H', facts: ['f'], tips: 'T', notice: '', goodFor: 'Foodies' })
    expect(mockGen).not.toHaveBeenCalled()
  })

  it('falls back to local generation on a cache miss/failure', async () => {
    mockFetch.mockResolvedValue({ state: 'failed' })
    mockGen.mockResolvedValue({ history: 'L', facts: [], tips: '', notice: '', goodFor: '' })
    const out = await runGenerate(stop({ placeId: PID }), 'Trip', 'Paris')
    expect(out.history).toBe('L')
    expect(mockGen).toHaveBeenCalledTimes(1)
  })

  it('falls back when a ready cache entry is empty', async () => {
    mockFetch.mockResolvedValue({ state: 'ready', content: { history: '', facts: [], tips: '', notice: '', goodFor: '' } })
    mockGen.mockResolvedValue({ history: 'L', facts: [], tips: '', notice: '', goodFor: '' })
    const out = await runGenerate(stop({ placeId: PID }), 'Trip', 'Paris')
    expect(out.history).toBe('L')
    expect(mockGen).toHaveBeenCalledTimes(1)
  })

  it('skips the shared cache entirely for by-name stops (no placeId)', async () => {
    mockGen.mockResolvedValue({ history: 'L', facts: [], tips: '', notice: '', goodFor: '' })
    const out = await runGenerate(stop({ name: 'X' }), 'Trip', 'Paris')
    expect(mockFetch).not.toHaveBeenCalled()
    expect(out.history).toBe('L')
  })

  it('throws on an all-empty local result (retryable)', async () => {
    mockGen.mockResolvedValue({ history: '', facts: [], tips: '', notice: '', goodFor: '' })
    await expect(runGenerate(stop({ name: 'X' }), 'Trip', 'Paris')).rejects.toThrow('empty-description')
  })
})
