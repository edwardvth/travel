import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useHeroMode } from './useHeroMode'

const KEY = 'voyager-hero-mode'

beforeEach(() => {
  window.localStorage.clear()
})
afterEach(() => {
  window.localStorage.clear()
})

describe('useHeroMode', () => {
  it('defaults to cinematic when nothing is persisted', () => {
    const { result } = renderHook(() => useHeroMode())
    expect(result.current[0]).toBe('cinematic')
  })

  it('persists the chosen mode to localStorage', () => {
    const { result } = renderHook(() => useHeroMode())
    act(() => {
      result.current[1]('explorer')
    })
    expect(result.current[0]).toBe('explorer')
    expect(window.localStorage.getItem(KEY)).toBe('explorer')
  })

  it('reads a previously persisted value on mount', () => {
    window.localStorage.setItem(KEY, 'explorer')
    const { result } = renderHook(() => useHeroMode())
    expect(result.current[0]).toBe('explorer')
  })

  it('ignores an invalid persisted value and falls back to cinematic', () => {
    window.localStorage.setItem(KEY, 'nonsense')
    const { result } = renderHook(() => useHeroMode())
    expect(result.current[0]).toBe('cinematic')
  })
})
