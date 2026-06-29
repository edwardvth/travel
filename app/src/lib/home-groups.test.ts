import { describe, it, expect } from 'vitest'
import { homeGroups, filterTrips, isUndatedTrip } from './home-groups'
import type { Trip } from '../types'

const trip = (id: string, startDate: string | undefined, numDays: number, extra: Partial<Trip['config']> = {}): Trip => ({
  id, title: id,
  config: { startDate, numDays, ...extra },
  data: { days: [], completed: [] },
} as unknown as Trip)

const TODAY = '2026-06-26'

describe('isUndatedTrip', () => {
  it('is true only when there is no startDate', () => {
    expect(isUndatedTrip(trip('a', undefined, 3))).toBe(true)
    expect(isUndatedTrip(trip('b', '2026-07-01', 3))).toBe(false)
  })
})

describe('homeGroups', () => {
  it('features the active trip and EXCLUDES it from all groups', () => {
    const active = trip('active', '2026-06-25', 3)   // 06-25..06-27 — contains today
    const soon = trip('soon', '2026-07-10', 2)
    const g = homeGroups([soon, active], TODAY)
    expect(g.featured?.id).toBe('active')
    expect([...g.upcoming, ...g.planning, ...g.past].map(t => t.id)).toEqual(['soon'])
  })

  it('groups + sorts: upcoming(start asc) -> planning(input) -> past(end desc), featured removed', () => {
    const featured = trip('f', '2026-07-01', 2)       // soonest upcoming -> featured
    const upLater = trip('up', '2026-08-01', 2)
    const planning = trip('plan', undefined, 4)
    const past1 = trip('p1', '2026-06-01', 2)          // ends 06-02
    const past2 = trip('p2', '2026-06-20', 2)          // ends 06-21 (more recent)
    const g = homeGroups([past1, planning, featured, upLater, past2], TODAY)
    expect(g.featured?.id).toBe('f')
    expect(g.upcoming.map(t => t.id)).toEqual(['up'])
    expect(g.planning.map(t => t.id)).toEqual(['plan'])
    expect(g.past.map(t => t.id)).toEqual(['p2', 'p1'])  // end desc
  })

  it('treats a trip ending today as not-past (boundary)', () => {
    const endsToday = trip('e', '2026-06-24', 3)        // 06-24..06-26 = active today
    const g = homeGroups([endsToday], TODAY)
    expect(g.featured?.id).toBe('e')
    expect(g.past).toHaveLength(0)
  })
})

describe('filterTrips', () => {
  it('matches title OR destination, case-insensitive', () => {
    // `featured` is active today so it absorbs the focus slot, leaving a & b in upcoming.
    const featured = trip('featured', '2026-06-25', 3)  // 06-25..06-27 — contains today
    const a = trip('a', '2026-07-01', 2, { destination: 'Paris, France' })
    a.title = 'Spring Break'
    const b = trip('b', '2026-07-05', 2, { destination: 'Tokyo' })
    const g = homeGroups([featured, a, b], TODAY)
    expect(filterTrips(g, 'paris').upcoming.map(t => t.id)).toEqual(['a'])  // via destination
    expect(filterTrips(g, '').upcoming).toHaveLength(2)                      // passthrough
  })
})
