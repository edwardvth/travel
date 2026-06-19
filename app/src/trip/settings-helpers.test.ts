import { describe, it, expect } from 'vitest'
import {
  computeDayLabels,
  daysBetween,
  endDateFor,
  resyncDays,
  droppingDaysWithStops,
  applyTripBasics,
  parseImportedTrip,
  resetTripData,
} from './settings-helpers'
import type { Day, Trip } from '../types'

function makeTrip(partial?: Partial<Trip>): Trip {
  return {
    id: 'nyc',
    owner_id: 'u1',
    title: 'NYC',
    subtitle: 'food & jazz',
    config: { title: 'NYC', subtitle: 'food & jazz', numDays: 3, startDate: '2026-05-07', dayLabels: [], dayTitles: [] },
    data: { days: [], completed: [], hotel: null },
    ...partial,
  }
}

describe('computeDayLabels', () => {
  it('builds dated labels/titles from a start date', () => {
    const r = computeDayLabels('2026-05-07', 3)
    expect(r.numDays).toBe(3)
    expect(r.dayLabels).toEqual(['May 7', 'May 8', 'May 9'])
    expect(r.dayTitles).toEqual(['May 7 · Day 1', 'May 8 · Day 2', 'May 9 · Day 3'])
  })
  it('rolls over month boundaries', () => {
    const r = computeDayLabels('2026-05-30', 3)
    expect(r.dayLabels).toEqual(['May 30', 'May 31', 'Jun 1'])
  })
  it('falls back to generic labels without a start date', () => {
    const r = computeDayLabels('', 2)
    expect(r.dayLabels).toEqual(['Day 1', 'Day 2'])
    expect(r.dayTitles).toEqual(['Day 1', 'Day 2'])
  })
  it('clamps to at least one day', () => {
    expect(computeDayLabels('2026-05-07', 0).numDays).toBe(1)
    expect(computeDayLabels('2026-05-07', -3).numDays).toBe(1)
  })
})

describe('daysBetween / endDateFor', () => {
  it('counts inclusive days', () => {
    expect(daysBetween('2026-05-07', '2026-05-10')).toBe(4)
    expect(daysBetween('2026-05-07', '2026-05-07')).toBe(1)
  })
  it('round-trips with endDateFor', () => {
    expect(endDateFor('2026-05-07', 4)).toBe('2026-05-10')
    expect(endDateFor('2026-05-07', 1)).toBe('2026-05-07')
    expect(daysBetween('2026-05-07', endDateFor('2026-05-07', 5))).toBe(5)
  })
})

describe('resyncDays', () => {
  const labels3 = computeDayLabels('2026-05-07', 3)

  it('preserves existing days/stops and refreshes titles', () => {
    const old: Day[] = [
      { title: 'old A', note: 'na', stops: [{ name: 'Stop1' }] },
      { title: 'old B', note: '', stops: [] },
    ]
    const out = resyncDays(old, labels3)
    expect(out).toHaveLength(3)
    // Existing stops/notes survive.
    expect(out[0].stops).toEqual([{ name: 'Stop1' }])
    expect(out[0].note).toBe('na')
    // Titles are recomputed.
    expect(out[0].title).toBe('May 7 · Day 1')
    expect(out[1].title).toBe('May 8 · Day 2')
    // The new third day is appended empty.
    expect(out[2]).toEqual({ title: 'May 9 · Day 3', note: '', stops: [] })
  })

  it('drops trailing days when shrinking', () => {
    const old: Day[] = [
      { title: 'A', note: '', stops: [{ name: 'S1' }] },
      { title: 'B', note: '', stops: [{ name: 'S2' }] },
      { title: 'C', note: '', stops: [{ name: 'S3' }] },
    ]
    const out = resyncDays(old, computeDayLabels('2026-05-07', 2))
    expect(out).toHaveLength(2)
    expect(out[0].stops).toEqual([{ name: 'S1' }])
    expect(out[1].stops).toEqual([{ name: 'S2' }])
  })

  it('handles undefined input', () => {
    const out = resyncDays(undefined, computeDayLabels('', 2))
    expect(out).toEqual([
      { title: 'Day 1', note: '', stops: [] },
      { title: 'Day 2', note: '', stops: [] },
    ])
  })
})

describe('droppingDaysWithStops', () => {
  const old: Day[] = [
    { title: 'A', note: '', stops: [{ name: 'S1' }] },
    { title: 'B', note: '', stops: [] },
    { title: 'C', note: '', stops: [{ name: 'S3' }] },
  ]
  it('is true when a dropped day has stops', () => {
    expect(droppingDaysWithStops(old, 2)).toBe(true) // drops C (has a stop)
  })
  it('is false when dropped days are empty', () => {
    expect(droppingDaysWithStops(old, 1)).toBe(true) // drops B(empty) + C(stop) -> true
    const old2: Day[] = [
      { title: 'A', note: '', stops: [{ name: 'S1' }] },
      { title: 'B', note: '', stops: [] },
    ]
    expect(droppingDaysWithStops(old2, 1)).toBe(false) // drops only B (empty)
  })
  it('is false when not shrinking', () => {
    expect(droppingDaysWithStops(old, 3)).toBe(false)
    expect(droppingDaysWithStops(old, 5)).toBe(false)
  })
})

describe('applyTripBasics', () => {
  it('recomputes config arrays and resyncs days consistently', () => {
    const trip = makeTrip({
      data: {
        days: [
          { title: 'x', note: 'keep', stops: [{ name: 'A' }] },
          { title: 'y', note: '', stops: [] },
        ],
        completed: ['0-0'],
        hotel: { name: 'H' },
      },
    })
    const { config, data } = applyTripBasics(trip, {
      title: 'New', subtitle: 'sub', startDate: '2026-06-01', numDays: 3,
    })
    expect(config.title).toBe('New')
    expect(config.subtitle).toBe('sub')
    expect(config.numDays).toBe(3)
    expect(config.dayLabels).toEqual(['Jun 1', 'Jun 2', 'Jun 3'])
    expect(config.dayTitles?.[0]).toBe('Jun 1 · Day 1')
    expect(data.days).toHaveLength(3)
    expect(data.days[0].note).toBe('keep')
    expect(data.days[0].stops).toEqual([{ name: 'A' }])
    expect(data.days[0].title).toBe('Jun 1 · Day 1')
    // completed + hotel untouched by a basics edit.
    expect(data.completed).toEqual(['0-0'])
    expect(data.hotel).toEqual({ name: 'H' })
  })
})

describe('parseImportedTrip', () => {
  const trip = makeTrip()

  it('accepts the new {config,data} export shape', () => {
    const raw = {
      id: 'nyc', title: 'Imported', subtitle: 'sub',
      config: { startDate: '2026-05-07', numDays: 2, dayLabels: ['x', 'y'], dayTitles: ['X', 'Y'] },
      data: { days: [{ title: 'D1', note: '', stops: [{ name: 'A' }] }, { title: 'D2', note: '', stops: [] }], completed: ['0-0'], hotel: { name: 'H' } },
    }
    const r = parseImportedTrip(raw, trip)
    expect(r.title).toBe('Imported')
    expect(r.data.days).toHaveLength(2)
    expect(r.data.days[0].stops).toEqual([{ name: 'A' }])
    expect(r.data.completed).toEqual(['0-0'])
    expect(r.data.hotel).toEqual({ name: 'H' })
    expect(r.config.dayLabels).toEqual(['x', 'y'])
    expect(typeof r.data.savedAt).toBe('string')
  })

  it('accepts the legacy top-level save shape (days at root)', () => {
    const raw = {
      days: [{ title: 'D1', note: 'n', stops: [{ name: 'A' }] }],
      completed: ['0-0'],
      hotel: { name: 'Legacy Hotel' },
      savedAt: '2020-01-01',
    }
    const r = parseImportedTrip(raw, trip)
    expect(r.data.days).toHaveLength(1)
    expect(r.data.hotel).toEqual({ name: 'Legacy Hotel' })
    // No config in legacy file -> recomputed from fallback start date.
    expect(r.config.numDays).toBe(1)
    expect(r.title).toBe(trip.title) // falls back
  })

  it('throws when there are no days', () => {
    expect(() => parseImportedTrip({ data: { days: [] } }, trip)).toThrow()
    expect(() => parseImportedTrip({ foo: 1 }, trip)).toThrow()
    expect(() => parseImportedTrip(null, trip)).toThrow()
  })

  it('coerces malformed day entries', () => {
    const raw = { data: { days: [null, { stops: 'nope' }, {}] } }
    const r = parseImportedTrip(raw, trip)
    expect(r.data.days).toHaveLength(3)
    expect(r.data.days[0].title).toBe('Day 1')
    expect(r.data.days[1].stops).toEqual([])
  })
})

describe('resetTripData', () => {
  it('clears stops/completed/hotel but keeps day count + titles', () => {
    const trip = makeTrip({
      data: {
        days: [
          { title: 'A', note: 'n1', stops: [{ name: 'S1' }] },
          { title: 'B', note: '', stops: [{ name: 'S2' }] },
        ],
        completed: ['0-0', '1-0'],
        hotel: { name: 'H' },
      },
    })
    const out = resetTripData(trip)
    expect(out.days).toEqual([
      { title: 'A', note: 'n1', stops: [] },
      { title: 'B', note: '', stops: [] },
    ])
    expect(out.completed).toEqual([])
    expect(out.hotel).toBeNull()
  })
})
