import { describe, it, expect } from 'vitest'
import { formatStayDate, hasStayDates } from './stay'

describe('formatStayDate', () => {
  it('formats a YYYY-MM-DD date in local time', () => {
    expect(formatStayDate('2026-07-02')).toBe('Jul 2, 2026')
  })

  it('accepts a date-time suffix and uses the date part', () => {
    expect(formatStayDate('2026-12-25T15:00')).toBe('Dec 25, 2026')
  })

  it('returns null for empty/invalid/missing input', () => {
    expect(formatStayDate(undefined)).toBeNull()
    expect(formatStayDate(null)).toBeNull()
    expect(formatStayDate('')).toBeNull()
    expect(formatStayDate('not-a-date')).toBeNull()
  })
})

describe('hasStayDates', () => {
  it('is true when either date is present', () => {
    expect(hasStayDates({ checkIn: '2026-07-02' })).toBe(true)
    expect(hasStayDates({ checkOut: '2026-07-05' })).toBe(true)
  })

  it('is false when neither date nor hotel is present', () => {
    expect(hasStayDates({})).toBe(false)
    expect(hasStayDates(null)).toBe(false)
  })
})
