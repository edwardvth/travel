// app/src/trip/guide/narrate.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { narrationCacheKey, narrateProxyUrl, fetchNarrationUrl, speakFallback } from './narrate'

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

describe('speakFallback', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

  function stubSpeech() {
    const utterances: Array<{ text: string; rate: number }> = []
    class FakeUtterance {
      rate = 1
      constructor(public text: string) { utterances.push(this as unknown as { text: string; rate: number }) }
    }
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance as unknown as typeof SpeechSynthesisUtterance)
    vi.stubGlobal('speechSynthesis', { cancel: vi.fn(), speak: vi.fn() })
    return utterances
  }

  it('returns false when Web Speech is unsupported', () => {
    vi.stubGlobal('speechSynthesis', undefined)
    expect(speakFallback('hi')).toBe(false)
  })

  it('defaults the utterance rate to 1', () => {
    const u = stubSpeech()
    expect(speakFallback('hi')).toBe(true)
    expect(u[0].rate).toBe(1)
  })

  it('applies the requested rate', () => {
    const u = stubSpeech()
    speakFallback('hi', 1.5)
    expect(u[0].rate).toBe(1.5)
  })

  it('clamps the rate to [0.5, 2]', () => {
    const u = stubSpeech()
    speakFallback('slow', 0.1)
    speakFallback('fast', 9)
    expect(u[0].rate).toBe(0.5)
    expect(u[1].rate).toBe(2)
  })
})
