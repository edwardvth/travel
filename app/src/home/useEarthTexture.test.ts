import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { useEarthTexture } from './useEarthTexture'

afterEach(() => vi.restoreAllMocks())

describe('useEarthTexture', () => {
  it('returns null and does not throw when Image is unavailable', () => {
    const orig = globalThis.Image
    // @ts-expect-error simulate SSR/jsdom-without-Image
    delete globalThis.Image
    const { result } = renderHook(() => useEarthTexture())
    expect(result.current).toBeNull()
    globalThis.Image = orig
  })

  it('returns the decoded image once it loads', () => {
    vi.useFakeTimers()
    const instances: any[] = []
    class FakeImage {
      onload: (() => void) | null = null
      decoding = ''
      _src = ''
      constructor() { instances.push(this) }
      set src(v: string) { this._src = v }
      get src() { return this._src }
    }
    // @ts-expect-error swap Image
    globalThis.Image = FakeImage
    // Force the setTimeout path (no requestIdleCallback).
    const ric = (globalThis as any).requestIdleCallback
    ;(globalThis as any).requestIdleCallback = undefined

    const { result } = renderHook(() => useEarthTexture())
    expect(result.current).toBeNull()
    act(() => { vi.runAllTimers() })           // fire the deferred load()
    act(() => { instances[0].onload?.() })     // simulate image decode complete
    expect(result.current).toBe(instances[0])

    ;(globalThis as any).requestIdleCallback = ric
    vi.useRealTimers()
  })
})
