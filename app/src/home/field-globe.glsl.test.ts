import { describe, it, expect } from 'vitest'
import { VERTEX_SRC, fragmentSource, FIELD_GLOBE_PARAMS } from './field-globe.glsl'

describe('field-globe shader source', () => {
  it('declares GLSL ES 3.00 and the per-frame uniforms', () => {
    expect(VERTEX_SRC).toMatch(/#version 300 es/)
    const frag = fragmentSource()
    expect(frag).toMatch(/#version 300 es/)
    for (const u of ['uResolution', 'uTime', 'uReduce', 'uArcSamples', 'uEarth']) {
      expect(frag).toMatch(new RegExp(`uniform[^;]*\\b${u}\\b`))
    }
  })

  it('bakes params as float literals (no bare integers that break GLSL)', () => {
    const frag = fragmentSource()
    // uArcCount is 2 → must be emitted as 2.0
    expect(frag).toMatch(/uArcCount=2\.0/)
    expect(frag).toMatch(/uHorizon=-0\.06/)
  })

  it('FIELD_GLOBE_PARAMS is frozen (signed-off values cannot be mutated)', () => {
    expect(Object.isFrozen(FIELD_GLOBE_PARAMS)).toBe(true)
    expect(() => {
      // @ts-expect-error runtime immutability check
      FIELD_GLOBE_PARAMS.uGlow = 99
    }).toThrow()
  })
})

describe('fragmentSource cost options', () => {
  it('defaults to 5 octaves + 5-tap blur (current look)', () => {
    const f = fragmentSource()
    expect(f).toMatch(/i<5/)              // fbm octaves
    expect(f).toMatch(/texture\(uEarth, uv \+ vec2\(0\.004,0\.0\)\)/) // blur taps present
  })
  it('can emit a cheaper variant (3 octaves, no blur taps)', () => {
    const f = fragmentSource(undefined, { octaves: 3, blur: false })
    expect(f).toMatch(/i<3/)
    expect(f).not.toMatch(/texture\(uEarth, uv \+ vec2/)
  })
})
