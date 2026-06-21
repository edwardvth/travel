// app/src/trip/guide/narrate.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { narrationCacheKey, narrateProxyUrl, fetchNarrationUrl } from './narrate'

describe('narrationCacheKey', () => {
  it('is stable for same text+voice, differs by voice', () => {
    const a = narrationCacheKey('Hello world', 'v1')
    expect(a).toBe(narrationCacheKey('Hello world', 'v1'))
    expect(a).not.toBe(narrationCacheKey('Hello world', 'v2'))
  })
})

describe('narrateProxyUrl', () => {
  it('points at the deployed TTS function slug', () => {
    expect(narrateProxyUrl('https://x.supabase.co/')).toBe('https://x.supabase.co/functions/v1/hyper-function')
  })
})

describe('fetchNarrationUrl', () => {
  afterEach(() => vi.restoreAllMocks())
  it('returns null on non-ok so caller falls back to Web Speech', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 500 } as Response)
    expect(await fetchNarrationUrl('text', 'v1')).toBeNull()
  })
  it('returns an object URL on success', async () => {
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:abc' })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, blob: async () => new Blob() } as unknown as Response)
    expect(await fetchNarrationUrl('text', 'v1')).toBe('blob:abc')
  })
})
