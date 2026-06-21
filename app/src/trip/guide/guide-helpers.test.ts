import { describe, it, expect } from 'vitest'
import { activeDayIndex, currentStopIndex, stopHeroQuery } from './guide-helpers'

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

describe('activeDayIndex', () => {
  it('uses today when it falls within the trip dates', () => {
    // trip starts 2026-06-19, 3 days; today is the 2nd day → index 1
    expect(activeDayIndex('2026-06-19', 3, 0, '2026-06-20')).toBe(1)
  })
  it('uses the first day on the start date itself', () => {
    expect(activeDayIndex('2026-06-19', 3, 2, '2026-06-19')).toBe(0)
  })
  it('falls back to the selected day before the trip', () => {
    expect(activeDayIndex('2026-06-19', 3, 2, '2026-06-10')).toBe(2)
  })
  it('falls back to the selected day after the trip', () => {
    expect(activeDayIndex('2026-06-19', 3, 1, '2026-07-01')).toBe(1)
  })
  it('clamps the fallback into range', () => {
    expect(activeDayIndex('2026-06-19', 3, 9, '2026-07-01')).toBe(2)
    expect(activeDayIndex('2026-06-19', 3, -4, '2026-07-01')).toBe(0)
  })
  it('falls back when there is no start date', () => {
    expect(activeDayIndex(null, 3, 1, '2026-06-20')).toBe(1)
    expect(activeDayIndex('not-a-date', 3, 2, '2026-06-20')).toBe(2)
  })
})
