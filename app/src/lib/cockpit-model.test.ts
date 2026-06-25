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
  it('is "unplanned" with a null day when the trip has no stops', () => {
    const m = cockpitModel(mk({ startDate: '2026-07-20', numDays: 3 }, [day(0), day(0)]), TODAY)
    expect(m.phase).toBe('unplanned')
    expect(m.featuredDay).toBeNull()
    expect(m.stopCount).toBe(0)
  })

  it('is "before" with a countdown and day 0 featured for a future planned trip', () => {
    const m = cockpitModel(mk({ startDate: '2026-07-17', numDays: 3 }, [day(2), day(1)]), TODAY)
    expect(m.phase).toBe('before')
    expect(m.countdownLabel).toBe('In 7 days')
    expect(m.featuredDay).toBe(0)
    expect(m.stopCount).toBe(3)
  })

  it('says "Tomorrow" the day before, and "Day N of M" while active', () => {
    expect(cockpitModel(mk({ startDate: '2026-07-11', numDays: 2 }, [day(1)]), TODAY).countdownLabel).toBe('Tomorrow')
    const during = cockpitModel(mk({ startDate: '2026-07-08', numDays: 5 }, [day(1), day(1), day(1)]), TODAY)
    expect(during.phase).toBe('during')
    expect(during.countdownLabel).toBe('Day 3 of 5')
    expect(during.featuredDay).toBe(2) // 0-based index of today
  })

  it('counts only to_reserve reservations as "to arrange"', () => {
    const m = cockpitModel(mk({ startDate: '2026-07-17', numDays: 1 }, [day(3, 2)]), TODAY)
    expect(m.toArrangeCount).toBe(2)
  })

  it('has a null countdown when the trip has no dates', () => {
    const m = cockpitModel(mk({}, [day(2)]), TODAY)
    expect(m.countdownLabel).toBeNull()
    expect(m.phase).toBe('before')
    expect(m.featuredDay).toBe(0)
  })
})
