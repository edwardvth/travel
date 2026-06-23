import { describe, it, expect } from 'vitest'
import { toInputTime, fromInputTime, nudgeTime } from './time'

describe('toInputTime', () => {
  it('parses 12h display strings to 24h HH:MM', () => {
    expect(toInputTime('7:30 PM')).toBe('19:30')
    expect(toInputTime('9:00 AM')).toBe('09:00')
    expect(toInputTime('12:00 AM')).toBe('00:00')
    expect(toInputTime('12:15 PM')).toBe('12:15')
  })
  it('returns "" for empty / unparseable', () => {
    expect(toInputTime(undefined)).toBe('')
    expect(toInputTime('')).toBe('')
    expect(toInputTime('soon')).toBe('')
  })
})

describe('fromInputTime', () => {
  it('converts 24h HH:MM back to a 12h display string', () => {
    expect(fromInputTime('19:30')).toBe('7:30 PM')
    expect(fromInputTime('00:00')).toBe('12:00 AM')
    expect(fromInputTime('12:00')).toBe('12:00 PM')
    expect(fromInputTime('09:05')).toBe('9:05 AM')
  })
  it('returns undefined for a malformed value', () => {
    expect(fromInputTime('7:30')).toBeUndefined()
    expect(fromInputTime('')).toBeUndefined()
  })
})

describe('nudgeTime', () => {
  it('nudges forward and back by minutes', () => {
    expect(nudgeTime('7:30 PM', -15)).toBe('7:15 PM')
    expect(nudgeTime('7:15 PM', -15)).toBe('7:00 PM')
    expect(nudgeTime('7:00 PM', 5)).toBe('7:05 PM')
    expect(nudgeTime('9:55 AM', 15)).toBe('10:10 AM')
  })
  it('clamps within the same day (never rolls past midnight)', () => {
    expect(nudgeTime('11:55 PM', 15)).toBe('11:59 PM')
    expect(nudgeTime('12:05 AM', -15)).toBe('12:00 AM')
  })
  it('leaves an unparseable time unchanged', () => {
    expect(nudgeTime('soon', 15)).toBe('soon')
    expect(nudgeTime(undefined, 15)).toBeUndefined()
  })
})
