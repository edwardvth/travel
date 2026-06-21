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
 * The leading "city" portion of a destination — the first comma-separated
 * segment (e.g. "St. Louis" from "St. Louis, Missouri, United States"). Returns
 * '' when the destination has no comma (already city-only) or is empty. Pure.
 */
export function cityOf(destination: string): string {
  const dest = (destination || '').trim()
  if (!dest.includes(',')) return ''
  return dest.split(',')[0].trim()
}

/**
 * Ordered, de-duplicated list of Wikipedia hero-image queries for a stop, most
 * specific first so a recognizable place resolves a real image before the
 * placeholder:
 *   1. "Name, Destination" (full locality — disambiguates same-named places),
 *   2. "Name, City" (just the leading city segment — looser match),
 *   3. "Name" (famous landmarks resolve best by bare name).
 * De-duped case-insensitively; empties dropped. Pure + unit-tested.
 */
export function heroQueries(stopName: string, destination: string): string[] {
  const name = (stopName || '').trim()
  if (!name) return []
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
  push(stopLandmarkQuery(name, destination))
  const city = cityOf(destination)
  if (city) push(stopLandmarkQuery(name, city))
  push(name)
  return out
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
