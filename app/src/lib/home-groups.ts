import type { Trip } from '../types'
import { tripStart, tripEnd } from './trip-helpers'
import { selectFocusTrip, todayISO } from './focus-trip'

/** The sentinel `tripStart` uses for a trip with no real dates. Centralized here. */
const UNDATED = '9999-12-31'

/** A trip with no real start date (its `tripStart` is the far-future sentinel). */
export function isUndatedTrip(t: Trip): boolean {
  return tripStart(t) === UNDATED
}

export interface HomeGroups {
  featured: Trip | null
  upcoming: Trip[]   // dated, not past — start asc
  planning: Trip[]   // undated upcoming — input order
  past: Trip[]       // end < today — end desc
}

/**
 * Split trips for the State-B home. Featured = `selectFocusTrip` (active-wins),
 * always EXCLUDED from the three groups. All comparisons are on local
 * `YYYY-MM-DD` strings (chronological as a string compare), so groups don't flip
 * around midnight / across time zones.
 */
export function homeGroups(trips: Trip[], today: string = todayISO()): HomeGroups {
  const featured = selectFocusTrip(trips, today)
  const rest = featured ? trips.filter(t => t.id !== featured.id) : trips

  const past = rest.filter(t => tripEnd(t) < today).sort((a, b) => tripEnd(b).localeCompare(tripEnd(a)))
  const notPast = rest.filter(t => tripEnd(t) >= today)
  const planning = notPast.filter(isUndatedTrip)
  const upcoming = notPast.filter(t => !isUndatedTrip(t)).sort((a, b) => tripStart(a).localeCompare(tripStart(b)))

  return { featured, upcoming, planning, past }
}

/** Lower-cased haystack for a trip: title + destination. (No separate city/country fields exist.) */
function haystack(t: Trip): string {
  return `${t.title ?? ''} ${t.config?.destination ?? ''}`.toLowerCase()
}

/** Filter each group by a trimmed, case-insensitive query (empty = passthrough). */
export function filterTrips(g: HomeGroups, query: string): HomeGroups {
  const q = query.trim().toLowerCase()
  if (!q) return g
  const f = (arr: Trip[]) => arr.filter(t => haystack(t).includes(q))
  return { featured: g.featured, upcoming: f(g.upcoming), planning: f(g.planning), past: f(g.past) }
}
