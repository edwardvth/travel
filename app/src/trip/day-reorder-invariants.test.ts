import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { addDay, removeDay, reorderDays } from './day-mutations'
import { followDayAfterReorder, followDayAfterDelete } from './itinerary-helpers'
import type { TripData } from '../types'

/**
 * Locks the four Day-Reorder Invariants from the plan-parity spec (§"Day Reorder
 * Invariants"). Day-index churn is the regression risk; these guard the four
 * things that must stay coherent through add/remove/reorder so a future change
 * trips a test instead of corrupting a trip.
 */
describe('Day-Reorder Invariants', () => {
  it('INV1: completed keys follow their day across reorder / delete / insert', () => {
    const data: TripData = {
      days: [
        { title: 'A', stops: [{ name: 'a' }] },
        { title: 'B', stops: [{ name: 'b' }] },
        { title: 'C', stops: [{ name: 'c' }] },
      ],
      completed: ['0-0', '2-0'],
    }
    // reorder A(0) -> end: order [1,2,0]; A's key 0->2, C's key 2->1
    expect(reorderDays(data, 0, 2).completed.sort()).toEqual(['1-0', '2-0'].sort())
    // delete A(0): drop its key, C 2->1
    expect(removeDay(data, 0).completed).toEqual(['1-0'])
    // append a day: existing keys unchanged
    expect(addDay(data).completed).toEqual(['0-0', '2-0'])
  })

  it('INV2: reservations live on the stop and travel with it; no day-indexed reservation state', () => {
    const data: TripData = {
      days: [
        { title: 'A', stops: [{ name: 'a', reservation: { status: 'reserved' as const } }] },
        { title: 'B', stops: [{ name: 'b' }] },
      ],
      completed: [],
    }
    const out = reorderDays(data, 0, 1)
    // stop a moved to day index 1, its reservation rode along untouched
    expect(out.days[1].stops[0].reservation?.status).toBe('reserved')
    // there is no top-level or per-day reservation map keyed by day index
    expect((out as unknown as Record<string, unknown>).reservations).toBeUndefined()
    expect((out.days[1] as unknown as Record<string, unknown>).reservations).toBeUndefined()
  })

  it('INV3: the selected day follows the same day across reorder / delete', () => {
    // viewing day 0; it moves to index 2 under order [1,2,0]
    expect(followDayAfterReorder(0, [1, 2, 0])).toBe(2)
    // viewing day 2; day 1 removed -> now at index 1
    expect(followDayAfterDelete(2, 1)).toBe(1)
    // viewing the removed day -> stays at the same slot (the caller clamps)
    expect(followDayAfterDelete(1, 1)).toBe(1)
  })

  it('INV4: the weather cache key is coord+date, never a day index', () => {
    // Per-day dates are derived BY POSITION (helpers.dayDate = startDate + index),
    // so a reorder changes which date a position maps to. The weather key must be
    // coord+date so it re-fetches the right forecast and never serves a stale day.
    const here = dirname(fileURLToPath(import.meta.url))
    const src = readFileSync(join(here, 'useWeather.ts'), 'utf8')
    expect(src).toMatch(/queryKey:\s*\['weather',\s*lat,\s*lng,\s*date\]/)
    expect(src).not.toMatch(/queryKey:[^\n]*\bday\b/)
  })
})
