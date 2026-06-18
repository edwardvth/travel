import { describe, it, expect } from 'vitest'
import { tripStart, tripEnd, isPastTrip, sanitizeSlug, isValidSlug, hasProfanity, buildNewTripPayload } from './trip-helpers'
import type { Trip } from '../types'

const mkTrip = (cfg: Partial<Trip['config']>, days = 0): Trip => ({
  id: 't', owner_id: 'o', title: 'T', subtitle: null,
  config: cfg, data: { days: Array.from({ length: days }, () => ({ title: '', stops: [] })), completed: [], hotel: null },
})

describe('trip date helpers', () => {
  it('tripStart falls back to far future when undated', () => {
    expect(tripStart(mkTrip({}))).toBe('9999-12-31')
    expect(tripStart(mkTrip({ startDate: '2026-07-01' }))).toBe('2026-07-01')
  })
  it('tripEnd adds numDays-1 to start', () => {
    expect(tripEnd(mkTrip({ startDate: '2026-07-01', numDays: 4 }))).toBe('2026-07-04')
  })
  it('isPastTrip is false for undated and for future trips', () => {
    expect(isPastTrip(mkTrip({}))).toBe(false)
    expect(isPastTrip(mkTrip({ startDate: '2999-01-01', numDays: 1 }))).toBe(false)
    expect(isPastTrip(mkTrip({ startDate: '2000-01-01', numDays: 1 }))).toBe(true)
  })
})

describe('slug + profanity', () => {
  it('sanitizes to lowercase a-z0-9_-', () => {
    expect(sanitizeSlug('Paris 2026!!')).toBe('paris2026')
  })
  it('validates slugs', () => {
    expect(isValidSlug('paris-2026')).toBe(true)
    expect(isValidSlug('bad slug')).toBe(false)
  })
  it('flags profanity', () => {
    expect(hasProfanity('shit trip')).toBe(true)
    expect(hasProfanity('kyoto')).toBe(false)
  })
})

describe('buildNewTripPayload', () => {
  it('computes numDays + day labels from a date range', () => {
    const p = buildNewTripPayload({ slug: 'kyoto', title: 'Kyoto', subtitle: '', start: '2026-06-30', end: '2026-07-03' })
    expect(p.config.numDays).toBe(4)
    expect(p.config.dayLabels?.[0]).toBe('Jun 30')
    expect(p.data.days).toHaveLength(4)
    expect(p.id).toBe('kyoto')
  })
  it('defaults to 4 undated days when no range', () => {
    const p = buildNewTripPayload({ slug: 'x', title: 'X', subtitle: '', start: '', end: '' })
    expect(p.config.numDays).toBe(4)
    expect(p.config.dayLabels?.[0]).toBe('Day 1')
  })
})
