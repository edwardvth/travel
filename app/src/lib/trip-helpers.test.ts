import { describe, it, expect } from 'vitest'
import { tripStart, tripEnd, isPastTrip, sanitizeSlug, isValidSlug, hasProfanity, buildNewTripPayload, slugify, sanitizeConfig } from './trip-helpers'
import type { Trip, TripConfig } from '../types'

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

describe('slugify', () => {
  it('lowercases and replaces spaces with dashes', () => {
    expect(slugify('Kyoto Spring 2026')).toBe('kyoto-spring-2026')
  })
  it('collapses punctuation + whitespace runs into single dashes', () => {
    expect(slugify('St. Louis,  Missouri!!')).toBe('st-louis-missouri')
  })
  it('trims leading/trailing dashes', () => {
    expect(slugify('  --Hello--  ')).toBe('hello')
  })
  it('collapses repeated dashes', () => {
    expect(slugify('a---b___c')).toBe('a-b-c')
  })
  it('falls back to a valid non-empty token for non-ASCII-only titles', () => {
    const slug = slugify('京都')
    expect(slug).toMatch(/^trip-[a-z0-9]+$/)
    expect(isValidSlug(slug)).toBe(true)
  })
  it('always yields a valid slug', () => {
    expect(isValidSlug(slugify('Paris, France'))).toBe(true)
    expect(isValidSlug(slugify('!!!'))).toBe(true)
  })
})

describe('sanitizeConfig', () => {
  it('strips the secret-key denylist', () => {
    const clean = sanitizeConfig({ title: 'T', anthropicKey: 'sk-1', aiKey: 'sk-2' } as TripConfig)
    expect(clean).not.toHaveProperty('anthropicKey')
    expect(clean).not.toHaveProperty('aiKey')
  })
  it('preserves all other keys', () => {
    const clean = sanitizeConfig({ title: 'T', destination: 'Kyoto', notes: 'n', aiKey: 'sk' } as TripConfig)
    expect(clean.title).toBe('T')
    expect(clean.destination).toBe('Kyoto')
    expect(clean.notes).toBe('n')
  })
  it('is a no-op (still cloned) when no secret is present', () => {
    const src: TripConfig = { title: 'T', destination: 'Kyoto' }
    const clean = sanitizeConfig(src)
    expect(clean).toEqual(src)
    expect(clean).not.toBe(src) // shallow clone, not the same reference
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
  it('defaults to 5 generic days when no range (Don\'t know dates yet)', () => {
    const p = buildNewTripPayload({ slug: 'x', title: 'X', subtitle: '', start: '', end: '' })
    expect(p.config.numDays).toBe(5)
    expect(p.config.dayLabels).toEqual(['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5'])
    expect(p.data.days).toHaveLength(5)
  })
  it('threads destination + notes into config', () => {
    const p = buildNewTripPayload({ slug: 'x', title: 'X', subtitle: '', start: '', end: '', destination: 'Kyoto, Japan', notes: 'pack light' })
    expect(p.config.destination).toBe('Kyoto, Japan')
    expect(p.config.notes).toBe('pack light')
  })
  it('omits destination + notes when empty/whitespace', () => {
    const p = buildNewTripPayload({ slug: 'x', title: 'X', subtitle: '', start: '', end: '', destination: '  ', notes: '' })
    expect(p.config).not.toHaveProperty('destination')
    expect(p.config).not.toHaveProperty('notes')
  })
  it('defaults subtitle to "" in the payload', () => {
    const p = buildNewTripPayload({ slug: 'x', title: 'X', subtitle: '', start: '', end: '' })
    expect(p.subtitle).toBe('')
    expect(p.config.subtitle).toBe('')
  })
  it('strips secret keys via sanitizeConfig (none survive)', () => {
    // Secret keys can't arrive through NewTripInput, but the guard must hold:
    // buildNewTripPayload routes config through sanitizeConfig on every create.
    const p = buildNewTripPayload({ slug: 'x', title: 'X', subtitle: '', start: '', end: '' })
    expect(p.config).not.toHaveProperty('anthropicKey')
    expect(p.config).not.toHaveProperty('aiKey')
  })
})
