import { fetchUnsplashCover } from './unsplash'
import { fetchFirstLandmarkImage } from './landmark'

/**
 * Resolve a trip cover from an ordered query list (destination first — see
 * `coverImageQueries`). Unsplash is the primary, higher-quality source;
 * Wikipedia is the keyless fallback. Tries Unsplash on the most relevant (first
 * non-empty) query, then falls through the full list on Wikipedia. Never throws.
 *
 * Bounded to a single Unsplash call per resolve (gentle on the rate limit, since
 * a destination search almost always returns a landscape result).
 */
export async function resolveCoverImage(queries: string[]): Promise<string | null> {
  const primary = queries.find(q => q.trim())
  if (primary) {
    const unsplash = await fetchUnsplashCover(primary)
    if (unsplash) return unsplash
  }
  return fetchFirstLandmarkImage(queries)
}
