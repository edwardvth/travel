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

/** The overlay carries aria-hidden; query it via that attribute. */
function overlay(): HTMLElement | null {
  return document.querySelector('[aria-hidden="true"]')
}

/** Force document.readyState for the duration of a test. */
function setReadyState(state: DocumentReadyState) {
  Object.defineProperty(document, 'readyState', {
    configurable: true,
    get: () => state,
  })
}

beforeEach(() => {
  reducedMotion.value = false
  setReadyState('complete') // jsdom default
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

  it('auto-dismisses once the page is ready (readyState=complete) past the min-visible + fade', () => {
    setReadyState('complete')
    const { container } = render(<SplashIntro />)

    // Visible immediately after mount.
    expect(overlay()).not.toBeNull()

    act(() => {
      vi.advanceTimersByTime(1000) // > min-visible (~350) + fade (~200)
    })
    expect(container.firstChild).toBeNull()
    expect(overlay()).toBeNull()
  })

  it('hard-cap path: dismisses even if the page never reports loaded', () => {
    setReadyState('loading') // never fires `load` in this test
    const { container } = render(<SplashIntro />)
    expect(overlay()).not.toBeNull()

    act(() => {
      vi.advanceTimersByTime(1100) // > hard cap (~800) + fade (~200)
    })
    expect(container.firstChild).toBeNull()
  })

  it('clicking the overlay removes it early', () => {
    setReadyState('loading') // avoid the ready-path racing the click
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
    setReadyState('loading')
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
    setReadyState('complete')
    const { container } = render(<SplashIntro />)

    expect(document.body.textContent).toContain('VOYAGER')

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(container.firstChild).toBeNull()
  })
})
