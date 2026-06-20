import type { Trip } from '../types'

/**
 * Derive a destination string for a trip, used as the locality context for
 * landmark-image searches (e.g. `"<stop name>, <destination>"`) and as the
 * query for a trip's cover image.
 *
 * Prefers `config.title` (the editorial trip title), falling back to the row
 * `title`. A fuzzy result is fine — Wikipedia's search tolerates trailing
 * years / words (e.g. "Kyoto Spring 2026" still resolves to Kyoto). Returns an
 * empty string when there's nothing usable, which callers treat as "skip".
 */
export function destinationOf(trip: Pick<Trip, 'title' | 'config'>): string {
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
 * Common city abbreviations → their full, Wikipedia-resolvable names. Keyed by
 * a lowercased token so the match is case-insensitive. These are short/all-caps
 * shorthands ("stl", "SF", "NYC") that Wikipedia search can't turn into a real
 * city article on their own — left unexpanded they yield no cover image.
 */
const DESTINATION_ABBREVIATIONS: Record<string, string> = {
  stl: 'St. Louis',
  sf: 'San Francisco',
  nyc: 'New York City',
  la: 'Los Angeles',
  dc: 'Washington D.C.',
  nola: 'New Orleans',
  philly: 'Philadelphia',
  vegas: 'Las Vegas',
  ldn: 'London',
  kc: 'Kansas City',
  atx: 'Austin',
  pdx: 'Portland',
  sd: 'San Diego',
  chi: 'Chicago',
}

/**
 * Expand a common city abbreviation to its full, Wikipedia-resolvable name.
 * Matches the whole trimmed input as a single token, case-insensitively (so
 * "stl", "STL", and " Stl " all map to "St. Louis"). Anything that isn't a
 * known abbreviation — including multi-word inputs like "Kyoto Spring 2026" —
 * is returned unchanged (trimming is left to the caller's existing handling).
 */
export function expandDestination(s: string): string {
  const token = s.trim().toLowerCase()
  return DESTINATION_ABBREVIATIONS[token] ?? s
}

/**
 * Ordered list of candidate Wikipedia queries to try for a trip's cover image,
 * best-resolving first:
 *   (a) the first up to 3 stop **names alone** — famous landmarks resolve best
 *       by name (e.g. "Gateway Arch") without a locality suffix, then
 *   (b) the trip's destination, with common abbreviations expanded
 *       (so "stl" → "St. Louis").
 * De-duplicated (case-insensitively) and stripped of empties. A brand-new trip
 * with no stops falls straight through to the expanded destination.
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
  push(expandDestination(destinationOf(trip)))

  return out
}
