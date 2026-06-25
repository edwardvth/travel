import { fetchUnsplashCover } from './unsplash'
import { fetchFirstLandmarkThumb } from './landmark'

export type CoverSource = 'wiki' | 'unsplash'
export interface ResolvedCover {
  url: string
  source: CoverSource
}

/**
 * Unsplash matches a clean city name ("St. Louis") far better than a verbose
 * "City, State, Country" string — that mismatch is what produced irrelevant
 * covers (a kitchen for St. Louis). Reduce a query to just its leading
 * comma-segment for the Unsplash search. Pure.
 */
export function unsplashQuery(q: string): string {
  const city = q.split(',')[0].trim()
  return city || q.trim()
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
