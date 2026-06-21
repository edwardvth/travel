import { describe, it, expect } from 'vitest'
import { mergeRealtimeTrip } from './realtime-merge'
import type { Trip } from '../types'

/** Minimal Trip factory with a given savedAt + a probe value on `completed`. */
function trip(savedAt: string | undefined, completed: string[] = []): Trip {
  return {
    id: 'stl',
    owner_id: null,
    title: 'St. Louis',
    subtitle: null,
    config: {},
    data: { days: [], completed, savedAt },
  }
}

describe('mergeRealtimeTrip', () => {
  it('accepts the incoming row when there is no local cache', () => {
    const incoming = trip('2026-06-21T10:00:00.000Z', ['0-0'])
    expect(mergeRealtimeTrip(undefined, incoming)).toBe(incoming)
    expect(mergeRealtimeTrip(null, incoming)).toBe(incoming)
  })

  it('applies a strictly newer incoming row (real remote edit)', () => {
    const local = trip('2026-06-21T10:00:00.000Z', [])
    const incoming = trip('2026-06-21T10:00:05.000Z', ['0-0'])
    expect(mergeRealtimeTrip(local, incoming)).toBe(incoming)
  })

  it('ignores a stale echo (older savedAt) — keeps newer local edits', () => {
    // The classic race: local has the newer optimistic completion; the server
    // echoes back an older row. We must NOT revert `completed`.
    const local = trip('2026-06-21T10:00:05.000Z', ['0-0', '0-1'])
    const stale = trip('2026-06-21T10:00:00.000Z', ['0-0'])
    expect(mergeRealtimeTrip(local, stale)).toBe(local)
  })

  it('ignores an equal-savedAt echo (own write coming back)', () => {
    const local = trip('2026-06-21T10:00:00.000Z', ['0-0'])
    const echo = trip('2026-06-21T10:00:00.000Z', ['0-0'])
    expect(mergeRealtimeTrip(local, echo)).toBe(local)
  })

  it('keeps local when the incoming row has no savedAt (cannot prove newer)', () => {
    const local = trip('2026-06-21T10:00:00.000Z', ['0-0'])
    const undated = trip(undefined, [])
    expect(mergeRealtimeTrip(local, undated)).toBe(local)
  })

  it('accepts a dated incoming row when local has no savedAt', () => {
    const local = trip(undefined, [])
    const incoming = trip('2026-06-21T10:00:00.000Z', ['0-0'])
    expect(mergeRealtimeTrip(local, incoming)).toBe(incoming)
  })

  it('does not mutate either input', () => {
    const local = trip('2026-06-21T10:00:05.000Z', ['0-0'])
    const incoming = trip('2026-06-21T10:00:00.000Z', [])
    const localSnapshot = JSON.parse(JSON.stringify(local))
    const incomingSnapshot = JSON.parse(JSON.stringify(incoming))
    mergeRealtimeTrip(local, incoming)
    expect(local).toEqual(localSnapshot)
    expect(incoming).toEqual(incomingSnapshot)
  })
})
