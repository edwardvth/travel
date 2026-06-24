import { describe, it, expect } from 'vitest'
import { completedKey, isCompleted, dayCount, dayStops, stopCount, dayDate, formatDayDate, weekdayDateLabel, isAutoDayTitle } from './helpers'
import type { Trip } from '../types'

const trip = (days: { stops: unknown[] }[], completed: string[] = [], numDays?: number): Trip => ({
  id: 't', owner_id: 'o', title: 't', subtitle: null,
  config: numDays !== undefined ? { numDays } : {},
  data: { days: days.map(d => ({ title: 'd', stops: d.stops as never[] })), completed, hotel: null },
})

const dated = (startDate?: string): Trip => ({
  id: 't', owner_id: 'o', title: 't', subtitle: null,
  config: startDate !== undefined ? { startDate } : {},
  data: { days: [], completed: [], hotel: null },
})

describe('completedKey', () => {
  it('joins day and stop with a dash', () => {
    expect(completedKey(0, 2)).toBe('0-2')
    expect(completedKey(3, 0)).toBe('3-0')
  })
})

describe('isCompleted', () => {
  it('reports membership against the completed array', () => {
    const c = ['0-0', '1-2']
    expect(isCompleted(c, 0, 0)).toBe(true)
    expect(isCompleted(c, 1, 2)).toBe(true)
    expect(isCompleted(c, 0, 1)).toBe(false)
  })
  it('handles undefined completed array', () => {
    expect(isCompleted(undefined, 0, 0)).toBe(false)
  })
})

describe('day helpers', () => {
  const t = trip([{ stops: [{}, {}] }, { stops: [] }, { stops: [{}] }])

  it('dayCount counts days, falling back to config.numDays', () => {
    expect(dayCount(t)).toBe(3)
    expect(dayCount(null)).toBe(0)
    expect(dayCount(trip([], [], 5))).toBe(5)
  })
  it('dayStops returns stops for a day or empty when out of range', () => {
    expect(dayStops(t, 0)).toHaveLength(2)
    expect(dayStops(t, 9)).toEqual([])
    expect(dayStops(null, 0)).toEqual([])
  })
  it('stopCount counts stops in a day', () => {
    expect(stopCount(t, 0)).toBe(2)
    expect(stopCount(t, 1)).toBe(0)
    expect(stopCount(t, 2)).toBe(1)
  })
})

describe('dayDate', () => {
  it('returns startDate for day 0 and advances by N local days', () => {
    expect(dayDate(dated('2026-07-02'), 0)).toBe('2026-07-02')
    expect(dayDate(dated('2026-07-02'), 1)).toBe('2026-07-03')
    expect(dayDate(dated('2026-07-02'), 5)).toBe('2026-07-07')
  })
  it('rolls over month and year boundaries', () => {
    expect(dayDate(dated('2026-01-30'), 3)).toBe('2026-02-02')
    expect(dayDate(dated('2026-12-31'), 1)).toBe('2027-01-01')
  })
  it('handles a leap-year February', () => {
    expect(dayDate(dated('2028-02-28'), 1)).toBe('2028-02-29')
  })
  it('returns null without a valid start date', () => {
    expect(dayDate(dated(), 0)).toBeNull()
    expect(dayDate(dated('not-a-date'), 0)).toBeNull()
    expect(dayDate(null, 0)).toBeNull()
  })
})

describe('formatDayDate', () => {
  it('renders a weekday and month/day for a valid date', () => {
    // 2026-07-02 is a Thursday.
    expect(formatDayDate('2026-07-02')).toBe('Thu · Jul 2')
  })
  it('returns null for null/invalid input', () => {
    expect(formatDayDate(null)).toBeNull()
    expect(formatDayDate('nope')).toBeNull()
  })
})

describe('weekdayDateLabel', () => {
  it('renders "Weekday, Mon D" for a valid date (2026-07-03 is a Friday)', () => {
    expect(weekdayDateLabel('2026-07-03')).toBe('Fri, Jul 3')
  })
  it('returns null for null/invalid input', () => {
    expect(weekdayDateLabel(null)).toBeNull()
    expect(weekdayDateLabel('nope')).toBeNull()
  })
})

describe('isAutoDayTitle', () => {
  it('treats empty, "Day N" and legacy "Mon D · Day N" as auto', () => {
    expect(isAutoDayTitle('')).toBe(true)
    expect(isAutoDayTitle(undefined)).toBe(true)
    expect(isAutoDayTitle('Day 3')).toBe(true)
    expect(isAutoDayTitle('Jun 22 · Day 1')).toBe(true)
  })
  it('treats a user-chosen name as custom', () => {
    expect(isAutoDayTitle('Beach day')).toBe(false)
    expect(isAutoDayTitle('Arrival & check-in')).toBe(false)
  })
})
