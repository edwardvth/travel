import { describe, it, expect } from 'vitest'
import { selectFocusTrip } from './focus-trip'
import type { Trip } from '../types'

const mk = (id: string, cfg: Partial<Trip['config']>): Trip => ({
  id, owner_id: 'o', title: id, subtitle: null,
  config: cfg, data: { days: [], completed: [], hotel: null },
})

const TODAY = '2026-07-10'

describe('selectFocusTrip', () => {
  it('returns null when there are no trips', () => {
    expect(selectFocusTrip([], TODAY)).toBeNull()
  })

  it('returns null when every trip is past', () => {
    const past = mk('past', { startDate: '2026-01-01', numDays: 3 })
    expect(selectFocusTrip([past], TODAY)).toBeNull()
  })

  it('prefers an active (in-progress) trip over a sooner-starting future one', () => {
    const active = mk('active', { startDate: '2026-07-08', numDays: 5 }) // 08–12, today 10
    const future = mk('future', { startDate: '2026-07-09', numDays: 1 }) // ends 09 → past, excluded
    const futureReal = mk('futureReal', { startDate: '2026-07-20', numDays: 2 })
    expect(selectFocusTrip([futureReal, active], TODAY)!.id).toBe('active')
    void future
  })

  it('picks the soonest dated upcoming trip when none are active', () => {
    const a = mk('a', { startDate: '2026-08-01', numDays: 2 })
    const b = mk('b', { startDate: '2026-07-15', numDays: 2 })
    expect(selectFocusTrip([a, b], TODAY)!.id).toBe('b')
  })

  it('falls back to an undated upcoming trip when there are no dated ones', () => {
    const undated = mk('u', {})
    expect(selectFocusTrip([undated], TODAY)!.id).toBe('u')
  })

  it('prefers a dated upcoming trip over an undated one', () => {
    const dated = mk('d', { startDate: '2026-07-20', numDays: 2 })
    const undated = mk('u', {})
    expect(selectFocusTrip([undated, dated], TODAY)!.id).toBe('d')
  })
})
