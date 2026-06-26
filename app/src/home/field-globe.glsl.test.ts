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
