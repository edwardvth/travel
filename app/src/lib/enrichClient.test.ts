import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchPlaceDescription, fetchPlaceDescriptionsBatch, regeneratePlace } from './enrichClient'

vi.mock('./supabase', () => ({
  SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon',
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}))

const okJson = (body: unknown) => ({ ok: true, json: async () => body } as Response)

describe('fetchPlaceDescription', () => {
  afterEach(() => vi.restoreAllMocks())
  it('returns ready content', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(okJson({ status: 'ready', content: { history: 'H', facts: ['a'], tips: 'T', notice: '' } }))
    const r = await fetchPlaceDescription('p1', { name: 'Gateway Arch' })
    expect(r.state).toBe('ready')
    expect(r.content?.history).toBe('H')
  })
  it('maps pending / failed / unsupported', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    spy.mockResolvedValueOnce(okJson({ status: 'pending' }))
    expect((await fetchPlaceDescription('p1', {})).state).toBe('pending')
    spy.mockResolvedValueOnce(okJson({ status: 'unsupported' }))
    expect((await fetchPlaceDescription('p1', {})).state).toBe('unsupported')
  })
  it('non-OK / throw → failed (never throws)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false } as Response)
    expect((await fetchPlaceDescription('p1', {})).state).toBe('failed')
  })
})

describe('fetchPlaceDescriptionsBatch', () => {
  afterEach(() => vi.restoreAllMocks())
  it('returns the ready map', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(okJson({ results: { p1: { history: 'H', facts: [], tips: '', notice: '' } } }))
    const m = await fetchPlaceDescriptionsBatch(['p1', 'p2'])
    expect(m.p1?.history).toBe('H')
    expect(m.p2).toBeUndefined()
  })
  it('empty input → {} (no fetch)', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    expect(await fetchPlaceDescriptionsBatch([])).toEqual({})
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('regeneratePlace', () => {
  afterEach(() => vi.restoreAllMocks())
  it('posts action regenerate and returns the result state', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okJson({ status: 'ready', content: { history: 'H2', facts: [], tips: '', notice: '' } }))
    const r = await regeneratePlace('p1', true)
    expect(r.state).toBe('ready')
    const body = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string)
    expect(body).toMatchObject({ action: 'regenerate', placeId: 'p1', force: true })
  })
})
