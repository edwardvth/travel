import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HeroVideoStage } from './HeroVideoStage'
import { clipForWord } from './wordClips'

// useReducedMotion is controlled per-test via this mutable flag.
const reducedMotion = { value: false }
vi.mock('framer-motion', () => ({
  useReducedMotion: () => reducedMotion.value,
}))

const PARIS = clipForWord('Paris')
const TOKYO = clipForWord('Tokyo')

beforeEach(() => {
  reducedMotion.value = false
  // jsdom doesn't implement media load(); stub it so source reloads don't throw.
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('HeroVideoStage', () => {
  it('paints the active clip poster and mounts video layers when motion is on', () => {
    const { container } = render(<HeroVideoStage clip={PARIS} />)
    const posters = container.querySelectorAll<HTMLImageElement>('[data-testid="hero-poster"]')
    expect(posters.length).toBeGreaterThan(0)
    expect(posters[0].getAttribute('src')).toBe(PARIS.poster)
    // Two crossfading video layers mount in the video path.
    expect(container.querySelectorAll('[data-testid="hero-video"]').length).toBe(2)
  })

  it('renders poster-only (no <video>) under reduced motion', () => {
    reducedMotion.value = true
    const { container } = render(<HeroVideoStage clip={PARIS} />)
    expect(container.querySelector('[data-testid="hero-poster"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="hero-video"]')).toBeNull()
  })

  it('stages the new clip onto a back layer when the clip prop changes', () => {
    const { container, rerender } = render(<HeroVideoStage clip={PARIS} />)
    rerender(<HeroVideoStage clip={TOKYO} />)
    // The incoming clip's poster should now be present (staged on the back layer).
    const srcs = Array.from(
      container.querySelectorAll<HTMLImageElement>('[data-testid="hero-poster"]'),
    ).map((img) => img.getAttribute('src'))
    expect(srcs).toContain(TOKYO.poster)
  })
})
