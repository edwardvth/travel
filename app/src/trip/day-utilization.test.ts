import { describe, it, expect } from 'vitest'
import { dayUtilization, OVERLOAD_MINUTES } from './day-utilization'
import type { Stop } from '../types'

describe('dayUtilization', () => {
  it('sums explicit durations (minutes) and counts stops', () => {
    const stops: Stop[] = [{ name: 'a', duration: 90 }, { name: 'b', duration: 30 }]
    const u = dayUtilization(stops)
    expect(u.stops).toBe(2)
    expect(u.minutes).toBe(120)
    expect(u.hours).toBe(2)
    expect(u.overloaded).toBe(false)
  })
  it('falls back to a per-kind default when duration is missing', () => {
    const u = dayUtilization([{ name: 'm', kind: 'eat' }, { name: 'museum', kind: 'do' }])
    expect(u.minutes).toBeGreaterThan(0) // both contribute their duration.ts default
    expect(u.stops).toBe(2)
  })
  it('flags overloaded past the threshold', () => {
    const stops: Stop[] = Array.from({ length: 8 }, (_, i) => ({ name: `s${i}`, duration: 100 }))
    expect(dayUtilization(stops).minutes).toBe(800)
    expect(800 > OVERLOAD_MINUTES).toBe(true)
    expect(dayUtilization(stops).overloaded).toBe(true)
  })
  it('handles an empty day', () => {
    expect(dayUtilization([])).toEqual({ stops: 0, minutes: 0, hours: 0, overloaded: false })
  })
})
