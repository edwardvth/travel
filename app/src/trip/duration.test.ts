import { describe, it, expect } from 'vitest'
import { normalizeDuration, defaultDurationMinutes, ensureDurations } from './duration'
import type { Stop } from '../types'

describe('normalizeDuration', () => {
  it('parses "<n> min" / "<n>m" / minutes words', () => {
    expect(normalizeDuration('90 min')).toBe(90)
    expect(normalizeDuration('45m')).toBe(45)
    expect(normalizeDuration('30 minutes')).toBe(30)
  })
  it('parses hours and hours+minutes', () => {
    expect(normalizeDuration('1h')).toBe(60)
    expect(normalizeDuration('2 hours')).toBe(120)
    expect(normalizeDuration('1h 30m')).toBe(90)
    expect(normalizeDuration('1 hour 30 min')).toBe(90)
    expect(normalizeDuration('1.5h')).toBe(90)
  })
  it('accepts a bare number as minutes', () => {
    expect(normalizeDuration(75)).toBe(75)
    expect(normalizeDuration('60')).toBe(60)
  })
  it('returns undefined for garbage / non-positive', () => {
    expect(normalizeDuration('soon')).toBeUndefined()
    expect(normalizeDuration('')).toBeUndefined()
    expect(normalizeDuration(0)).toBeUndefined()
    expect(normalizeDuration(null)).toBeUndefined()
    expect(normalizeDuration(undefined)).toBeUndefined()
  })
})

describe('defaultDurationMinutes', () => {
  it('reads meal/type cues from type + name', () => {
    expect(defaultDurationMinutes({ name: 'Blue Bottle Coffee', type: 'Cafe' })).toBe(45)
    expect(defaultDurationMinutes({ name: 'Lunch at Z', type: 'Restaurant' })).toBe(75)
    expect(defaultDurationMinutes({ name: 'Osteria', type: 'Restaurant' })).toBe(90)
    expect(defaultDurationMinutes({ name: 'The Louvre', type: 'Museum' })).toBe(90)
    expect(defaultDurationMinutes({ name: 'Opera House', type: 'Theatre' })).toBe(150)
    expect(defaultDurationMinutes({ name: 'Central Park', type: 'Park' })).toBe(60)
    expect(defaultDurationMinutes({ name: 'Riverside walk', type: 'Walking route' })).toBe(30)
  })
  it('falls back to kind, then 60', () => {
    expect(defaultDurationMinutes({ name: 'Somewhere', kind: 'eat' })).toBe(75)
    expect(defaultDurationMinutes({ name: 'Somewhere' })).toBe(60)
  })
})

describe('ensureDurations', () => {
  it('fills only stops missing a duration, immutably', () => {
    const stops: Stop[] = [
      { name: 'Cafe', type: 'Cafe' },
      { name: 'Museum', type: 'Museum', duration: 120 },
    ]
    const out = ensureDurations(stops)
    expect(out[0].duration).toBe(45)
    expect(out[1].duration).toBe(120)
    expect(stops[0].duration).toBeUndefined()
  })
})
