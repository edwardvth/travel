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
 * Ordered list of candidate Wikipedia queries for a trip's cover image,
 * **destination first**:
 *   (a) the trip's destination (`destinationOf`) — the thumbnail represents the
 *       place, so the destination leads (e.g. "St. Louis, Missouri, United States"),
 *   (b) then the first up to 3 stop **names alone**, only as a fallback when the
 *       destination resolves no image.
 * De-duplicated (case-insensitively) and stripped of empties. A brand-new trip
 * with no stops is just the destination. (Stop-names-first used to pin a generic
 * stop's image — a hotel → a suitcase — as the cover; destination-first fixes that.)
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

  push(destinationOf(trip))
  const stops = trip.data?.days?.flatMap(d => d.stops ?? []) ?? []
  for (const stop of stops.slice(0, 3)) push(stop.name ?? '')

  return out
}

/**
 * Classify a stored `config.coverImage` so a backfill knows what it may touch:
 *   - `'user'`  → a `data:` URL (a user upload) — NEVER auto-touch.
 *   - `'auto'`  → a machine-resolved hotlink (Wikipedia/Wikimedia OR Unsplash) —
 *                 safe to re-resolve.
 *   - `'other'` → anything else (e.g. a pasted external URL) or empty — leave alone.
 * Pure.
 */
export function classifyCover(coverImage: string | undefined | null): 'user' | 'auto' | 'other' {
  const v = (coverImage ?? '').trim()
  if (!v) return 'other'
  if (v.startsWith('data:')) return 'user'
  try {
    const host = new URL(v).host.toLowerCase()
    if (host === 'upload.wikimedia.org' || host.includes('wikipedia')) return 'auto'
    if (host === 'images.unsplash.com' || host.endsWith('.unsplash.com')) return 'auto'
  } catch {
    /* not a parseable URL */
  }
  return 'other'
}
