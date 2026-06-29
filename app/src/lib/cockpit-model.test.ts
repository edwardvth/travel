import { describe, it, expect } from 'vitest'
import { cockpitModel } from './cockpit-model'
import type { Trip, Day } from '../types'

const day = (stops: number, reserveTo = 0): Day => ({
  title: 'D',
  stops: Array.from({ length: stops }, (_, i) => ({
    name: `s${i}`,
    ...(i < reserveTo ? { reservation: { status: 'to_reserve' as const } } : {}),
  })),
})
const mk = (cfg: Partial<Trip['config']>, days: Day[]): Trip => ({
  id: 't', owner_id: 'o', title: 'Kyoto', subtitle: null,
  config: cfg, data: { days, completed: [], hotel: null },
})

const TODAY = '2026-07-10'

describe('cockpitModel', () => {
  it('is "before" with a countdown, day 0, and "Day 1" label for a future trip', () => {
    const m = cockpitModel(mk({ startDate: '2026-07-17', numDays: 3 }, [day(2), day(1), day(0)]), TODAY)
    expect(m.phase).toBe('before')
    expect(m.countdownLabel).toBe('In 7 days')
    expect(m.featuredDay).toBe(0)
    expect(m.dayLabel).toBe('Day 1')
    expect(m.stopCount).toBe(3)
  })

  it('says "Tomorrow" the day before', () => {
    expect(cockpitModel(mk({ startDate: '2026-07-11', numDays: 2 }, [day(1)]), TODAY).countdownLabel).toBe('Tomorrow')
  })

  it('is "during" with "Day N of M", today\'s index, and a "Today" label while active', () => {
    const m = cockpitModel(mk({ startDate: '2026-07-08', numDays: 5 }, [day(1), day(1), day(1), day(1), day(1)]), TODAY)
    expect(m.phase).toBe('during')
    expect(m.countdownLabel).toBe('Day 3 of 5')
    expect(m.featuredDay).toBe(2) // 0-based index of today
    expect(m.dayLabel).toBe('Today')
  })

  it('itineraryComplete is true only when every day has a stop', () => {
    expect(cockpitModel(mk({ startDate: '2026-07-17', numDays: 2 }, [day(1), day(2)]), TODAY).itineraryComplete).toBe(true)
    expect(cockpitModel(mk({ startDate: '2026-07-17', numDays: 2 }, [day(1), day(0)]), TODAY).itineraryComplete).toBe(false)
    expect(cockpitModel(mk({ startDate: '2026-07-17', numDays: 1 }, []), TODAY).itineraryComplete).toBe(false)
  })

  it('counts only to_reserve reservations as "to arrange"', () => {
    expect(cockpitModel(mk({ startDate: '2026-07-17', numDays: 1 }, [day(3, 2)]), TODAY).toArrangeCount).toBe(2)
  })

  it('has a null countdown when the trip has no dates', () => {
    const m = cockpitModel(mk({}, [day(2)]), TODAY)
    expect(m.countdownLabel).toBeNull()
    expect(m.phase).toBe('before')
    expect(m.featuredDay).toBe(0)
  })
})
