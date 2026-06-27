import { fetchUnsplashCover } from './unsplash'
import { fetchFirstLandmarkThumb } from './landmark'

/**
 * Bump this when the cover-resolution logic changes (a new landmark override,
 * a query tweak) to re-resolve every cover ONCE on the next load, then settle.
 * v1: clean-city Unsplash query + Paris→Eiffel override.
 */
export const COVER_LOGIC_VERSION = 1

export type CoverSource = 'wiki' | 'unsplash'
export interface ResolvedCover {
  url: string
  source: CoverSource
}

/**
 * Hand-picked overrides for the rare city whose iconic shot Unsplash's plain
 * city-name search misses (e.g. "Paris" returns a Seine bridge, not the Eiffel
 * Tower). Deliberately tiny — add an entry only when a specific city looks
 * wrong; most cities don't need one. Keyed by lowercased city name.
 */
const LANDMARK_OVERRIDES: Record<string, string> = {
  paris: 'Eiffel Tower',
}

/**
 * Direct image-URL overrides for a city whose auto-resolved cover keeps landing
 * wrong and a specific shot is wanted. Unlike LANDMARK_OVERRIDES (a search-query
 * nudge), this pins the exact image, so it can't be re-resolved to something else
 * by the backfill. MUST be an `images.unsplash.com/photo-…` (or other direct CDN)
 * URL. Wins over an auto/stored cover, but never over a user's own upload.
 * Keyed by lowercased city (leading comma-segment of the destination).
 */
const COVER_URL_OVERRIDES: Record<string, string> = {
  london: 'https://images.unsplash.com/photo-1486299267070-83823f5448dd?w=1600&q=80&fm=jpg&fit=max',
}

/** The pinned cover URL for a destination's city, or null. Pure. */
export function coverUrlOverrideFor(destination: string): string | null {
  const city = destination.split(',')[0].trim().toLowerCase()
  return COVER_URL_OVERRIDES[city] ?? null
}

/**
 * Unsplash matches a clean city name ("St. Louis") far better than a verbose
 * "City, State, Country" string — that mismatch is what produced irrelevant
 * covers (a kitchen for St. Louis). Reduce a query to just its leading
 * comma-segment, applying a landmark override when one exists. Pure.
 */
export function unsplashQuery(q: string): string {
  const city = q.split(',')[0].trim()
  return LANDMARK_OVERRIDES[city.toLowerCase()] ?? (city || q.trim())
}

/**
 * Resolve a trip cover from an ordered query list (destination first — see
 * `coverImageQueries`).
 *
 * Unsplash is the PRIMARY source — high-quality, editorial photography — queried
 * by the clean city name so results are relevant. Wikipedia is the keyless
 * fallback (the actual landmark) for when Unsplash has nothing:
 *   1. Unsplash, on the clean city name of the most relevant query.
 *   2. else Wikipedia (first hit across the full query list).
 *   3. else null.
 * Never throws.
 */
export async function resolveCoverImage(queries: string[]): Promise<ResolvedCover | null> {
  const primary = queries.find(q => q.trim())
  if (primary) {
    const unsplash = await fetchUnsplashCover(unsplashQuery(primary))
    if (unsplash) return { url: unsplash, source: 'unsplash' }
  }

  const wiki = await fetchFirstLandmarkThumb(queries)
  if (wiki) return { url: wiki.url, source: 'wiki' }
  return null
}
