import { fetchUnsplashCover } from './unsplash'
import { fetchFirstLandmarkThumb } from './landmark'

/** Below this rendered width a Wikipedia thumbnail is treated as too low-quality
 *  for a full-bleed cover, so we try Unsplash instead. */
export const MIN_GOOD_COVER_WIDTH = 700

export type CoverSource = 'wiki' | 'unsplash'
export interface ResolvedCover {
  url: string
  source: CoverSource
}

/**
 * Resolve a trip cover from an ordered query list (destination first — see
 * `coverImageQueries`).
 *
 * Wikipedia is the PRIMARY source: it returns the actual landmark for the place,
 * so it's the most accurate. It's only bad when the article's lead image is tiny
 * or missing — so we fall back to Unsplash (higher quality, but a looser, more
 * generic match) only then:
 *   1. Wikipedia, if it returns an image at least `MIN_GOOD_COVER_WIDTH` wide.
 *   2. else Unsplash (one call, on the most relevant query).
 *   3. else a small Wikipedia image, if any (beats a bare gradient).
 *   4. else null.
 * Never throws.
 */
export async function resolveCoverImage(queries: string[]): Promise<ResolvedCover | null> {
  const wiki = await fetchFirstLandmarkThumb(queries)
  if (wiki && wiki.width >= MIN_GOOD_COVER_WIDTH) return { url: wiki.url, source: 'wiki' }

  const primary = queries.find(q => q.trim())
  if (primary) {
    const unsplash = await fetchUnsplashCover(primary)
    if (unsplash) return { url: unsplash, source: 'unsplash' }
  }

  if (wiki) return { url: wiki.url, source: 'wiki' } // low-res, but better than nothing
  return null
}
