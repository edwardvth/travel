import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { useInViewActive } from './useInViewActive'

let cb: (entries: { isIntersecting: boolean }[]) => void
beforeEach(() => {
  cb = () => {}
  // @ts-expect-error minimal IO mock
  globalThis.IntersectionObserver = class {
    constructor(fn: typeof cb) { cb = fn }
    observe() {} disconnect() {} unobserve() {}
  }
})

describe('useInViewActive', () => {
  it('hero active by default; globe inactive', () => {
    const { result } = renderHook(() => useInViewActive())
    expect(result.current.heroActive).toBe(true)
    expect(result.current.globeActive).toBe(false)
  })
  it('switches to globe when the globe region intersects', () => {
    const { result } = renderHook(() => useInViewActive())
    // globeRef is a CALLBACK ref — attaching the node re-renders → effect observes.
    act(() => { result.current.globeRef(document.createElement('div')) })
    act(() => { cb([{ isIntersecting: true }]) })
    expect(result.current.globeActive).toBe(true)
    expect(result.current.heroActive).toBe(false)
  })
})
