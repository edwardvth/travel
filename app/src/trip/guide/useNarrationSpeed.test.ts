import { describe, it, expect } from 'vitest'
import { SPEEDS, nextSpeed, parseSpeed } from './useNarrationSpeed'

describe('nextSpeed', () => {
  it('advances through every step in order', () => {
    expect(nextSpeed(0.75)).toBe(1)
    expect(nextSpeed(1)).toBe(1.25)
    expect(nextSpeed(1.25)).toBe(1.5)
    expect(nextSpeed(1.5)).toBe(1.75)
    expect(nextSpeed(1.75)).toBe(2)
  })

  it('cycles 2 → 0.75', () => {
    expect(nextSpeed(2)).toBe(0.75)
  })

  it('treats unknown/invalid as base 1 → next is 1.25', () => {
    expect(nextSpeed(0)).toBe(1.25)
    expect(nextSpeed(3)).toBe(1.25)
    expect(nextSpeed(NaN)).toBe(1.25)
    expect(nextSpeed(1.1)).toBe(1.25)
  })

  it('only ever returns a known speed', () => {
    for (const s of SPEEDS) expect(SPEEDS).toContain(nextSpeed(s))
  })
})

describe('parseSpeed', () => {
  it('parses a valid stored value', () => {
    expect(parseSpeed('1.5')).toBe(1.5)
    expect(parseSpeed('0.75')).toBe(0.75)
    expect(parseSpeed('2')).toBe(2)
  })

  it('clamps an unknown numeric value to 1', () => {
    expect(parseSpeed('1.1')).toBe(1)
    expect(parseSpeed('3')).toBe(1)
    expect(parseSpeed('0')).toBe(1)
  })

  it('returns 1 for null or unparseable input', () => {
    expect(parseSpeed(null)).toBe(1)
    expect(parseSpeed('')).toBe(1)
    expect(parseSpeed('fast')).toBe(1)
  })
})
