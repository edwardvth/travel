import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HeroModeCinematic } from './HeroModeCinematic'
import { HERO_CONFIG } from './clips'

// useReducedMotion is controlled per-test via this mutable flag.
const reducedMotion = { value: false }
vi.mock('framer-motion', () => ({
  useReducedMotion: () => reducedMotion.value,
}))

/** Install a matchMedia stub that reports the given matches for any query. */
function stubMatchMedia(matches: (query: string) => boolean) {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: matches(query),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
        onchange: null,
      }) as unknown as MediaQueryList,
  )
}

/** Force a wide, fine-pointer, fast-network environment (video-eligible). */
function makeVideoFriendlyEnv() {
  stubMatchMedia(() => false) // not coarse pointer
  Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true })
  // Remove any connection info so no save-data / slow path triggers.
  if ('connection' in navigator) {
    Object.defineProperty(navigator, 'connection', { value: undefined, configurable: true })
  }
}

const ALL_POSTERS = HERO_CONFIG.clips.map((c) => c.poster)

beforeEach(() => {
  reducedMotion.value = false
  makeVideoFriendlyEnv()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('HeroModeCinematic — reduced motion', () => {
  it('renders a poster image and no <video>, with no drift animation', () => {
    reducedMotion.value = true
    const { container } = render(<HeroModeCinematic />)

    const poster = container.querySelector<HTMLImageElement>('[data-testid="hero-poster"]')
    expect(poster).not.toBeNull()
    expect(ALL_POSTERS).toContain(poster!.getAttribute('src'))

    // Poster-only: no video element at all.
    expect(container.querySelector('[data-testid="hero-video"]')).toBeNull()

    // No Ken-Burns drift under reduced motion.
    expect(poster!.style.animation).toBeFalsy()
  })
})

describe('HeroModeCinematic — default (motion on, fine pointer)', () => {
  it('paints the poster base layer with a clip poster src', () => {
    const { container } = render(<HeroModeCinematic />)
    const poster = container.querySelector<HTMLImageElement>('[data-testid="hero-poster"]')
    expect(poster).not.toBeNull()
    expect(ALL_POSTERS).toContain(poster!.getAttribute('src'))
  })

  it('applies the Ken-Burns drift animation when motion is allowed', () => {
    const { container } = render(<HeroModeCinematic />)
    const poster = container.querySelector<HTMLImageElement>('[data-testid="hero-poster"]')
    expect(poster!.style.animation).toContain('voyager-ken-burns')
  })
})

describe('HeroModeCinematic — poster-only policy', () => {
  it('mounts no <video> when navigator.connection.saveData is true', () => {
    Object.defineProperty(navigator, 'connection', {
      value: { saveData: true, effectiveType: '4g' },
      configurable: true,
    })

    const { container } = render(<HeroModeCinematic />)

    expect(container.querySelector('[data-testid="hero-poster"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="hero-video"]')).toBeNull()
  })

  it('mounts no <video> on a coarse-pointer / small screen', () => {
    stubMatchMedia((q) => q.includes('coarse'))
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true })

    const { container } = render(<HeroModeCinematic />)

    expect(container.querySelector('[data-testid="hero-poster"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="hero-video"]')).toBeNull()
  })
})
