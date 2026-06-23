import { describe, it, expect } from 'vitest'
import { dayColor } from './map-style'

describe('dayColor (muted multi-day ramp)', () => {
  it('is deterministic per (day, total)', () => {
    expect(dayColor(0, 3)).toBe(dayColor(0, 3))
  })

  it('spreads hues around the wheel by index', () => {
    expect(dayColor(0, 4)).not.toBe(dayColor(1, 4))
    expect(dayColor(0, 4)).toBe('hsl(0, 32%, 52%)')
  })

  it('uses a MUTED saturation (≤ 40%), not the old vivid 65%', () => {
    const sat = Number(/hsl\(\d+,\s*(\d+)%/.exec(dayColor(2, 5))![1])
    expect(sat).toBeLessThanOrEqual(40)
  })

  it('guards total=0 (no divide-by-zero)', () => {
    expect(dayColor(0, 0)).toBe('hsl(0, 32%, 52%)')
  })
})
