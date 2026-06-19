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

  it('starts a rAF loop with motion enabled and cancels it on unmount', () => {
    // jsdom has no real 2d canvas; stub getContext so the animated branch runs.
    const makeGradient = () => ({ addColorStop: vi.fn() })
    const mockCtx = {
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
      createLinearGradient: vi.fn(makeGradient),
      createRadialGradient: vi.fn(makeGradient),
      drawImage: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      setTransform: vi.fn(),
      scale: vi.fn(),
      translate: vi.fn(),
      // assignable style/state props the component sets
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      globalAlpha: 1,
      font: '',
      textBaseline: '',
    }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      mockCtx as unknown as CanvasRenderingContext2D,
    )

    const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(1 as never)
    const cancelSpy = vi.spyOn(globalThis, 'cancelAnimationFrame')

    const { unmount } = render(<HeroModeExplorer activeTerm="Seoul" />)

    // The loop must have been scheduled (motion enabled, onscreen by default).
    expect(rafSpy).toHaveBeenCalled()

    unmount()

    // Teardown must cancel the pending frame.
    expect(cancelSpy).toHaveBeenCalled()
  })
})
