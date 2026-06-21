// app/src/trip/guide/hero-resolver.ts
//
// The hero-image fallback CHAIN, run in priority order, each layer attempted
// only when the previous one misses (returns null):
//
//   1. Wikipedia pageimages   — fetchFirstLandmarkImage(queries)   [free]
//   2. Wikimedia Commons      — fetchFirstCommonsImage(queries)    [free]
//   3. Google Places Photos   — fetchPlacePhotoUrl(placesQuery)    [paid, dormant]
//
// (The synchronous `coverPhoto(stop)` and the final striped placeholder are
// handled by the caller — this resolver covers the three on-demand layers.)
//
// The Google layer gracefully no-ops to null when its function/key isn't
// deployed, so the app behaves EXACTLY as today until an operator adds the key.
// Every layer never throws -> null, so the whole chain never throws.
import { fetchFirstLandmarkImage } from '../landmark'
import { fetchFirstCommonsImage } from '../commons'
import { fetchPlacePhotoUrl } from './placePhoto'

/** The async layers of the hero chain, injectable so the chain is unit-testable. */
export interface HeroResolverDeps {
  pageimages: (queries: string[]) => Promise<string | null>
  commons: (queries: string[]) => Promise<string | null>
  places: (query: string) => Promise<string | null>
}

const defaultDeps: HeroResolverDeps = {
  pageimages: fetchFirstLandmarkImage,
  commons: fetchFirstCommonsImage,
  places: fetchPlacePhotoUrl,
}

/**
 * Resolve a stop's hero image across the three on-demand layers, in order,
 * advancing only on a miss. `queries` is the ordered hero query list ("Name,
 * Destination" -> "Name, City" -> "Name") shared by the two free layers;
 * `placesQuery` is the single most-specific query ("Name, Destination") handed
 * to the paid layer. Returns the first hit or null if everything misses. Never
 * throws. `deps` is injectable for tests.
 */
export async function resolveHeroImage(
  queries: string[],
  placesQuery: string,
  deps: HeroResolverDeps = defaultDeps,
): Promise<string | null> {
  const list = (queries ?? []).map(q => q.trim()).filter(Boolean)
  if (list.length === 0 && !placesQuery.trim()) return null

  const fromWiki = await deps.pageimages(list)
  if (fromWiki) return fromWiki

  const fromCommons = await deps.commons(list)
  if (fromCommons) return fromCommons

  const pq = placesQuery.trim()
  if (pq) {
    const fromPlaces = await deps.places(pq)
    if (fromPlaces) return fromPlaces
  }
  return null
}
