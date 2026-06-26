import { describe, it, expect } from 'vitest'
import { QUALITY_LEVELS, nextLevel, qualityFor } from './adaptive-quality'

describe('adaptive quality ladder', () => {
  it('steps down a level when sustained frame time is high', () => {
    expect(nextLevel(0, 30)).toBe(1)
  })
  it('steps up a level when frame time is comfortably low', () => {
    expect(nextLevel(2, 10)).toBe(1)
  })
  it('holds when frame time is in the neutral band', () => {
    expect(nextLevel(1, 18)).toBe(1)
  })
  it('clamps at both ends', () => {
    expect(nextLevel(0, 10)).toBe(0)
    const last = QUALITY_LEVELS.length - 1
    expect(nextLevel(last, 40)).toBe(last)
  })
  it('exposes a quality config per level with monotonically cheaper settings', () => {
    const a = qualityFor(0)
    const b = qualityFor(QUALITY_LEVELS.length - 1)
    expect(a.arcSamples).toBeGreaterThanOrEqual(b.arcSamples)
    expect(a.dprCap).toBeGreaterThanOrEqual(b.dprCap)
    expect(b.cadenceMs).toBeGreaterThanOrEqual(a.cadenceMs)
  })
})
