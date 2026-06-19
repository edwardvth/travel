import { describe, it, expect } from 'vitest'
import { completedKey, isCompleted, dayCount, dayStops, stopCount } from './helpers'
import type { Trip } from '../types'

const trip = (days: { stops: unknown[] }[], completed: string[] = [], numDays?: number): Trip => ({
  id: 't', owner_id: 'o', title: 't', subtitle: null,
  config: numDays !== undefined ? { numDays } : {},
  data: { days: days.map(d => ({ title: 'd', stops: d.stops as never[] })), completed, hotel: null },
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
