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

const SPLASH_KEY = 'voyager-splash-seen'

/** The overlay carries aria-hidden; query it via that attribute. */
function overlay(): HTMLElement | null {
  return document.querySelector('[aria-hidden="true"]')
}

beforeEach(() => {
  reducedMotion.value = false
  sessionStorage.clear()
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
    // The wordmark renders each letter as its own element, so assert the
    // letters are present (textContent of the rig contains VOYAGER).
    expect(document.body.textContent).toContain('VOYAGER')
    expect(overlay()).not.toBeNull()
  })

  it('full mode: sets the sessionStorage flag and removes itself after the full duration', () => {
    expect(sessionStorage.getItem(SPLASH_KEY)).toBeNull()
    const { container } = render(<SplashIntro />)

    // full mode marks the splash as seen immediately on mount.
    expect(sessionStorage.getItem(SPLASH_KEY)).toBe('1')

    act(() => {
      vi.advanceTimersByTime(3000) // comfortably past the full ceiling
    })
    expect(container.firstChild).toBeNull()
    expect(overlay()).toBeNull()
  })

  it('short mode: with the flag preset, completes faster (~500ms)', () => {
    sessionStorage.setItem(SPLASH_KEY, '1')
    const { container } = render(<SplashIntro />)

    // still visible just after mount
    expect(overlay()).not.toBeNull()

    act(() => {
      vi.advanceTimersByTime(1000) // > short hold + fade
    })
    expect(container.firstChild).toBeNull()
  })

  it('reduced mode: no long animation; removed after the short fade', () => {
    reducedMotion.value = true
    const { container } = render(<SplashIntro />)

    // reduced mode does not write the seen flag (no full animation occurred)
    act(() => {
      vi.advanceTimersByTime(800) // > reduced hold + fade
    })
    expect(container.firstChild).toBeNull()
  })

  it('clicking the overlay removes it early', () => {
    const { container } = render(<SplashIntro />)
    const el = overlay()
    expect(el).not.toBeNull()

    act(() => {
      fireEvent.click(el!)
      vi.advanceTimersByTime(500) // past the quick skip fade
    })
    expect(container.firstChild).toBeNull()
  })

  it('pressing Escape removes it early', () => {
    const { container } = render(<SplashIntro />)
    expect(overlay()).not.toBeNull()

    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' })
      vi.advanceTimersByTime(500)
    })
    expect(container.firstChild).toBeNull()
  })
})
