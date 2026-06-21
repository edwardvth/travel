import { describe, it, expect } from 'vitest'
import { activeDayIndex, currentStopIndex, dayNavModel, dayStopRows, stopHeroQuery } from './guide-helpers'

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

describe('dayStopRows', () => {
  it('classifies done / current / upcoming with current = first not-done', () => {
    const rows = dayStopRows(0, 4, ['0-0'])
    expect(rows).toEqual([
      { index: 0, status: 'done' },
      { index: 1, status: 'current' },
      { index: 2, status: 'upcoming' },
      { index: 3, status: 'upcoming' },
    ])
  })

  it('marks every stop done with no current when the day is complete', () => {
    const rows = dayStopRows(1, 2, ['1-0', '1-1'])
    expect(rows.map(r => r.status)).toEqual(['done', 'done'])
  })

  it('first stop is current when nothing is complete', () => {
    const rows = dayStopRows(0, 3, [])
    expect(rows.map(r => r.status)).toEqual(['current', 'upcoming', 'upcoming'])
  })

  it('keeps a jumped-ahead completed stop as done while current stays the first gap', () => {
    // The traveller completed stop 2 out of order; stop 0 is still current.
    const rows = dayStopRows(0, 3, ['0-2'])
    expect(rows.map(r => r.status)).toEqual(['current', 'upcoming', 'done'])
  })

  it('keys completion by the given day index', () => {
    const rows = dayStopRows(2, 2, ['0-0', '2-1'])
    expect(rows.map(r => r.status)).toEqual(['current', 'done'])
  })

  it('returns an empty list for a day with no stops', () => {
    expect(dayStopRows(0, 0, [])).toEqual([])
  })
})

describe('stopHeroQuery', () => {
  it('appends the destination to the stop name', () => {
    expect(stopHeroQuery('Old Courthouse', 'St. Louis, Missouri, United States'))
      .toBe('Old Courthouse, St. Louis, Missouri, United States')
  })
})

describe('dayNavModel', () => {
  const labels = ['Aug 5', 'Aug 6', 'Aug 7']

  it('at the start boundary has no prev label and atStart', () => {
    const m = dayNavModel(0, 3, labels)
    expect(m.prevLabel).toBeNull()
    expect(m.activeLabel).toBe('Aug 5')
    expect(m.nextLabel).toBe('Aug 6')
    expect(m.atStart).toBe(true)
    expect(m.atEnd).toBe(false)
  })

  it('at the end boundary has no next label and atEnd', () => {
    const m = dayNavModel(2, 3, labels)
    expect(m.prevLabel).toBe('Aug 6')
    expect(m.activeLabel).toBe('Aug 7')
    expect(m.nextLabel).toBeNull()
    expect(m.atStart).toBe(false)
    expect(m.atEnd).toBe(true)
  })

  it('in the middle exposes both neighbour labels', () => {
    const m = dayNavModel(1, 3, labels)
    expect(m.prevLabel).toBe('Aug 5')
    expect(m.activeLabel).toBe('Aug 6')
    expect(m.nextLabel).toBe('Aug 7')
    expect(m.atStart).toBe(false)
    expect(m.atEnd).toBe(false)
  })

  it('a single-day trip is both start and end', () => {
    const m = dayNavModel(0, 1, ['Aug 5'])
    expect(m.prevLabel).toBeNull()
    expect(m.nextLabel).toBeNull()
    expect(m.atStart).toBe(true)
    expect(m.atEnd).toBe(true)
  })

  it('falls back to "Day N" when labels are missing', () => {
    const m = dayNavModel(1, 3, undefined)
    expect(m.prevLabel).toBe('Day 1')
    expect(m.activeLabel).toBe('Day 2')
    expect(m.nextLabel).toBe('Day 3')
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
