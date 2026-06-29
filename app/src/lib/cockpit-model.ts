import type { Trip } from '../types'
import { allReservations } from '../trip/reservation'
import { todayISO } from './focus-trip'

export type CockpitPhase = 'before' | 'during'

export interface CockpitModel {
  /** Trip timing relative to today. */
  phase: CockpitPhase
  /** "In 7 days" / "Tomorrow" / "Day 3 of 5" — null when the trip has no dates. */
  countdownLabel: string | null
  /** Day index to feature for weather/labels (0 before the trip, today's index during). */
  featuredDay: number
  /** Label for the featured day — 'Today' during, 'Day N' before. */
  dayLabel: string
  /** Count of stops still to reserve (status 'to_reserve'). */
  toArrangeCount: number
  /** Total stops across all days. */
  stopCount: number
  /** True when every day has at least one stop (the itinerary is fully planned). */
  itineraryComplete: boolean
}

/** Parse a local `YYYY-MM-DD` to a midnight Date, or null. */
function parseLocal(iso: string | undefined | null): Date | null {
  if (!iso) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

/** Whole-day delta `to - from` (negative if `to` is earlier). Null on bad input. */
function daysBetween(fromISO: string, toISO: string): number | null {
  const a = parseLocal(fromISO)
  const b = parseLocal(toISO)
  if (!a || !b) return null
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

/**
 * Derive the cockpit's display state from a trip. Pure + unit-tested; the
 * component layers weather/cover on top. `today` is injectable for tests.
 */
export function cockpitModel(trip: Trip, today: string = todayISO()): CockpitModel {
  const days = trip.data?.days ?? []
  const stopCount = days.reduce((n, d) => n + (d.stops?.length ?? 0), 0)
  const start = trip.config?.startDate
  const numDays = trip.config?.numDays || days.length || 1

  const toArrangeCount = allReservations(trip).filter(e => e.status === 'to_reserve').length
  const itineraryComplete = days.length > 0 && days.every(d => (d.stops?.length ?? 0) > 0)

  // Timing from dates (undated → "before" with no countdown).
  const fromStart = start ? daysBetween(start, today) : null // today - start
  const isDuring = fromStart !== null && fromStart >= 0 && fromStart <= numDays - 1
  const phase: CockpitPhase = isDuring ? 'during' : 'before'

  let countdownLabel: string | null = null
  if (start && fromStart !== null) {
    if (isDuring) {
      countdownLabel = `Day ${fromStart + 1} of ${numDays}`
    } else if (fromStart < 0) {
      const until = -fromStart
      countdownLabel = until === 1 ? 'Tomorrow' : `In ${until} days`
    }
  }

  const featuredDay = isDuring ? Math.min(Math.max(fromStart ?? 0, 0), numDays - 1) : 0
  const dayLabel = isDuring ? 'Today' : `Day ${featuredDay + 1}`

  return { phase, countdownLabel, featuredDay, dayLabel, toArrangeCount, stopCount, itineraryComplete }
}
