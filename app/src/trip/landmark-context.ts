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
