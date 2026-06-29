import { describe, it, expect } from 'vitest'
import { stopHoursLabel } from './stop-hours'

const UNIFORM = [
  'Monday: 9:30 AM – 11:45 PM','Tuesday: 9:30 AM – 11:45 PM','Wednesday: 9:30 AM – 11:45 PM',
  'Thursday: 9:30 AM – 11:45 PM','Friday: 9:30 AM – 11:45 PM','Saturday: 9:30 AM – 11:45 PM',
  'Sunday: 9:30 AM – 11:45 PM',
]
const VARIES = [
  'Monday: 9:00 AM – 5:00 PM','Tuesday: 9:00 AM – 5:00 PM','Wednesday: 9:00 AM – 5:00 PM',
  'Thursday: 9:00 AM – 5:00 PM','Friday: 9:00 AM – 9:00 PM','Saturday: 10:00 AM – 9:00 PM',
  'Sunday: Closed',
]

describe('stopHoursLabel', () => {
  it('returns "" for empty/undefined', () => {
    expect(stopHoursLabel(undefined)).toBe('')
    expect(stopHoursLabel([])).toBe('')
  })
  it('collapses uniform days to "Daily <range>"', () => {
    expect(stopHoursLabel(UNIFORM)).toBe('Daily 9:30 AM–11:45 PM')
  })
  it('shows the scheduled weekday when hours vary and a date is given', () => {
    // 2026-07-03 is a Friday
    expect(stopHoursLabel(VARIES, '2026-07-03')).toBe('Fri 9:00 AM–9:00 PM')
    // 2026-07-05 is a Sunday (Closed)
    expect(stopHoursLabel(VARIES, '2026-07-05')).toBe('Sun Closed')
  })
  it('hides ("") when hours vary and there is no date', () => {
    expect(stopHoursLabel(VARIES)).toBe('')
  })
})
