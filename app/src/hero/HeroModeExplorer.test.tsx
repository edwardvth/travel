import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HeroModeExplorer } from './HeroModeExplorer'

// useReducedMotion is controlled per-test via this mutable flag (same pattern
// as HeroModeCinematic.test).
const reducedMotion = { value: false }
vi.mock('framer-motion', () => ({
  useReducedMotion: () => reducedMotion.value,
}))

beforeEach(() => {
  reducedMotion.value = false
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('HeroModeExplorer', () => {
  it('renders without throwing even though jsdom canvas has no 2d context', () => {
    // jsdom's HTMLCanvasElement.getContext returns null; the component must guard.
    const { container } = render(<HeroModeExplorer activeTerm="Tokyo" />)
    expect(container.querySelector('[data-testid="hero-explorer"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="hero-explorer-canvas"]')).not.toBeNull()
  })

  it('passes through className', () => {
    const { container } = render(<HeroModeExplorer className="absolute inset-0" />)
    const root = container.querySelector('[data-testid="hero-explorer"]')
    expect(root?.className).toContain('absolute inset-0')
  })

  it('marks the root static and starts no rAF loop under reduced motion', () => {
    reducedMotion.value = true
    const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame')

    const { container } = render(<HeroModeExplorer activeTerm="Kyoto" />)

    const root = container.querySelector('[data-testid="hero-explorer"]')
    expect(root?.getAttribute('data-static')).toBe('true')

    // In jsdom getContext() is null, so neither branch draws — but crucially the
    // animation loop must not be scheduled in reduced-motion mode.
    expect(rafSpy).not.toHaveBeenCalled()
  })

  it('unmounts cleanly (no throw) with motion enabled', () => {
    const { unmount } = render(<HeroModeExplorer activeTerm="Seoul" />)
    expect(() => unmount()).not.toThrow()
  })
})
