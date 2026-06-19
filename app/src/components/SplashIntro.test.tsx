import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// useReducedMotion is mocked per-test via this hoisted ref. Default = false
// (motion on). framer-motion's `motion.*` components render their DOM element,
// so structure/lifecycle assertions work under jsdom (which can't animate).
const reducedMotion = { value: false }
vi.mock('framer-motion', async () => {
  const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion')
  return { ...actual, useReducedMotion: () => reducedMotion.value }
})

import SplashIntro from './SplashIntro'
import { signalHeroReady, _resetHeroReady } from '../hero/heroReady'

/** The overlay carries aria-hidden; query it via that attribute. */
function overlay(): HTMLElement | null {
  return document.querySelector('[aria-hidden="true"]')
}

beforeEach(() => {
  reducedMotion.value = false
  _resetHeroReady()
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup() // unmount before flushing so timer callbacks don't update a live tree
  act(() => {
    vi.runOnlyPendingTimers()
  })
  vi.useRealTimers()
})

describe('SplashIntro', () => {
  it('renders the VOYAGER wordmark and the overlay is aria-hidden', () => {
    act(() => {
      render(<SplashIntro />)
    })
    expect(document.body.textContent).toContain('VOYAGER')
    expect(overlay()).not.toBeNull()
    expect(overlay()!.getAttribute('aria-hidden')).toBe('true')
  })

  it('auto-dismisses once the hero signals ready (past min-visible + fade)', () => {
    const { container } = render(<SplashIntro />)

    // Visible immediately after mount.
    expect(overlay()).not.toBeNull()

    act(() => {
      signalHeroReady()
      // > min-visible (~350) + fade (~200), well under the safety cap.
      vi.advanceTimersByTime(700)
    })
    expect(container.firstChild).toBeNull()
    expect(overlay()).toBeNull()
  })

  it('honors the min-visible floor when hero-ready fires immediately', () => {
    const { container } = render(<SplashIntro />)

    act(() => {
      signalHeroReady()
      vi.advanceTimersByTime(100) // below the ~350 floor
    })
    // Still present — the floor has not elapsed yet.
    expect(container.firstChild).not.toBeNull()

    act(() => {
      vi.advanceTimersByTime(600) // past floor + fade
    })
    expect(container.firstChild).toBeNull()
  })

  it('safety-cap path: dismisses even if the hero never signals ready', () => {
    const { container } = render(<SplashIntro />)
    expect(overlay()).not.toBeNull()

    act(() => {
      vi.advanceTimersByTime(2800) // > safety cap (~2500) + fade (~200)
    })
    expect(container.firstChild).toBeNull()
  })

  it('clicking the overlay removes it early', () => {
    const { container } = render(<SplashIntro />)
    const el = overlay()
    expect(el).not.toBeNull()

    act(() => {
      fireEvent.click(el!)
      vi.advanceTimersByTime(300) // past the quick fade
    })
    expect(container.firstChild).toBeNull()
  })

  it('pressing Escape removes it early', () => {
    const { container } = render(<SplashIntro />)
    expect(overlay()).not.toBeNull()

    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' })
      vi.advanceTimersByTime(300)
    })
    expect(container.firstChild).toBeNull()
  })

  it('reduced motion: still renders and auto-dismisses without error', () => {
    reducedMotion.value = true
    const { container } = render(<SplashIntro />)

    expect(document.body.textContent).toContain('VOYAGER')

    act(() => {
      signalHeroReady()
      vi.advanceTimersByTime(700)
    })
    expect(container.firstChild).toBeNull()
  })
})
