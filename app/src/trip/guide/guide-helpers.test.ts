import { describe, it, expect } from 'vitest'
import { currentStopIndex, stopHeroQuery } from './guide-helpers'

describe('currentStopIndex', () => {
  it('returns the first not-completed stop index', () => {
    expect(currentStopIndex(1, ['Hotel', 'Arch', 'Museum'], ['1-0'])).toBe(1)
  })
  it('returns -1 when all complete', () => {
    expect(currentStopIndex(0, ['A', 'B'], ['0-0', '0-1'])).toBe(-1)
  })
  it('returns 0 when nothing complete', () => {
    expect(currentStopIndex(2, ['A'], [])).toBe(0)
  })
})

describe('stopHeroQuery', () => {
  it('appends the destination to the stop name', () => {
    expect(stopHeroQuery('Old Courthouse', 'St. Louis, Missouri, United States'))
      .toBe('Old Courthouse, St. Louis, Missouri, United States')
  })
})
