import type { Trip } from '../types'
import { tripStart, tripEnd } from './trip-helpers'

/** Today as a local `YYYY-MM-DD` string. Matches the format `trip-helpers` uses. */
export function todayISO(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/**
 * Pick the single trip the home cockpit should focus on (spec §4). Pure +
 * testable via the injectable `today`. Precedence:
 *   1. active (start ≤ today ≤ end) — soonest to end wins
 *   2. soonest dated upcoming (by start)
 *   3. undated upcoming (input order)
 *   4. null → the home renders the Launchpad (State C)
 * "Upcoming" = not past = end ≥ today. Undated trips have tripStart '9999-12-31'.
 */
export function selectFocusTrip(trips: Trip[], today: string = todayISO()): Trip | null {
  const upcoming = trips.filter(t => tripEnd(t) >= today)
  if (upcoming.length === 0) return null

  const active = upcoming
    .filter(t => tripStart(t) <= today) // end ≥ today already; undated start is far future
    .sort((a, b) => tripEnd(a).localeCompare(tripEnd(b)))
  if (active.length) return active[0]

  const dated = upcoming
    .filter(t => tripStart(t) !== '9999-12-31')
    .sort((a, b) => tripStart(a).localeCompare(tripStart(b)))
  if (dated.length) return dated[0]

  return upcoming[0] // undated upcoming, input order
}
