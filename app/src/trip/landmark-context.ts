import type { Trip } from '../types'

/**
 * Derive a destination string for a trip, used as the locality context for
 * landmark-image searches (e.g. `"<stop name>, <destination>"`) and as the
 * query for a trip's cover image.
 *
 * Prefers `config.destination` (the real place captured at creation, e.g.
 * "St. Louis, Missouri, United States"), then `config.title` (the editorial
 * trip title), falling back to the row `title`. A fuzzy result is fine —
 * Wikipedia's search tolerates trailing years / words (e.g. "Kyoto Spring 2026"
 * still resolves to Kyoto). Returns an empty string when there's nothing
 * usable, which callers treat as "skip".
 */
export function destinationOf(trip: Pick<Trip, 'title' | 'config'>): string {
  const fromDestination = typeof trip.config?.destination === 'string' ? trip.config.destination.trim() : ''
  if (fromDestination) return fromDestination
  const fromConfig = typeof trip.config?.title === 'string' ? trip.config.title.trim() : ''
  if (fromConfig) return fromConfig
  return (trip.title ?? '').trim()
}

/** Build the Wikipedia query for a stop within a destination context. */
export function stopLandmarkQuery(stopName: string, destination: string): string {
  const name = stopName.trim()
  const dest = destination.trim()
  if (!name) return ''
  return dest ? `${name}, ${dest}` : name
}

/**
 * Ordered list of candidate Wikipedia queries to try for a trip's cover image,
 * best-resolving first:
 *   (a) the first up to 3 stop **names alone** — famous landmarks resolve best
 *       by name (e.g. "Gateway Arch") without a locality suffix, then
 *   (b) the trip's destination (`destinationOf`) — now the real place captured
 *       at creation (e.g. "St. Louis, Missouri, United States").
 * De-duplicated (case-insensitively) and stripped of empties. A brand-new trip
 * with no stops falls straight through to the destination.
 */
export function coverImageQueries(trip: Pick<Trip, 'title' | 'config' | 'data'>): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (raw: string) => {
    const q = raw.trim()
    if (!q) return
    const key = q.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    out.push(q)
  }

  const stops = trip.data?.days?.flatMap(d => d.stops ?? []) ?? []
  for (const stop of stops.slice(0, 3)) push(stop.name ?? '')
  push(destinationOf(trip))

  return out
}
