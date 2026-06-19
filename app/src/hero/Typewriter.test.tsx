import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Typewriter } from './Typewriter'
import { HERO_DESTINATIONS } from '../data/heroDestinations'

const PROMPT = 'Where do you want to go?'

// Mock framer-motion's useReducedMotion so each test controls the path taken.
const reducedMotion = { value: false }
vi.mock('framer-motion', () => ({
  useReducedMotion: () => reducedMotion.value,
}))

describe('Typewriter (animated)', () => {
  beforeEach(() => {
    reducedMotion.value = false
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('types the opening prompt one character at a time', () => {
    const { getByTestId } = render(<Typewriter />)

    // After a few type ticks the visible text is a non-empty prefix of PROMPT.
    act(() => {
      vi.advanceTimersByTime(55 * 4)
    })
    const text = getByTestId('typewriter-text').textContent ?? ''
    expect(text.length).toBeGreaterThan(0)
    expect(PROMPT.startsWith(text)).toBe(true)
    expect(text.length).toBeLessThan(PROMPT.length)
  })

  it('fires onTermChange with the first destination after cycling past the prompt', () => {
    const spy = vi.fn()
    render(<Typewriter onTermChange={spy} />)

    // Advance generously through prompt (type+hold+delete+pause) and into the
    // first destination so its full word is typed.
    act(() => {
      vi.advanceTimersByTime(60_000)
    })

    const firstDest = HERO_DESTINATIONS[0]
    expect(spy).toHaveBeenCalledWith(firstDest)
    // The opening prompt announces '' (no destination node).
    expect(spy).toHaveBeenCalledWith('')
  })
})

describe('Typewriter (reduced motion)', () => {
  beforeEach(() => {
    reducedMotion.value = true
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('shows a full word immediately rather than typing char-by-char', () => {
    const spy = vi.fn()
    const { getByTestId } = render(<Typewriter onTermChange={spy} />)

    // No timer advance: the first word should already be fully present.
    expect(getByTestId('typewriter-text').textContent).toBe(PROMPT)
    // It announced the prompt term ('').
    expect(spy).toHaveBeenCalledWith('')
  })

  it('rotates to a full destination word on its interval', () => {
    const spy = vi.fn()
    const { getByTestId } = render(<Typewriter onTermChange={spy} />)

    // One rotation tick (2500ms) + fade (320ms) lands on the next full word.
    act(() => {
      vi.advanceTimersByTime(2500 + 320 + 10)
    })

    const shown = getByTestId('typewriter-text').textContent ?? ''
    expect(shown).toBe(HERO_DESTINATIONS[0])
    expect(spy).toHaveBeenCalledWith(HERO_DESTINATIONS[0])
  })
})
