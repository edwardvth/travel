import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchLandmarkImage, fetchFirstLandmarkImage } from '../trip/landmark'
import { resolveHeroImage } from '../trip/guide/hero-resolver'

/** A day in ms — landmark images are effectively static, so we cache hard. */
const ONE_DAY = 24 * 60 * 60 * 1000

export interface UseLandmarkImageResult {
  /** The Wikimedia thumbnail URL, or null (no match / not yet loaded). */
  url: string | null
  loading: boolean
}

/**
 * Display-on-demand landmark image for a place `query` (e.g. a destination or
 * stop name). Backed by TanStack Query so cards can ask for an image lazily
 * without hammering Wikipedia — keyed on `['landmark', query]`, cached for a
 * day, and only enabled when there's a non-empty query.
 *
 * Fails soft: a miss or error resolves to `url: null`, so the caller renders a
 * placeholder rather than a broken `<img>`.
 */
export function useLandmarkImage(query?: string): UseLandmarkImageResult {
  const q = query?.trim() ?? ''
  const enabled = !!q

  const result = useQuery({
    queryKey: ['landmark', q],
    enabled,
    staleTime: ONE_DAY,
    gcTime: ONE_DAY,
    retry: 1,
    queryFn: () => fetchLandmarkImage(q),
  })

  return {
    url: result.data ?? null,
    loading: enabled && result.isLoading,
  }
}

/**
 * Full hero-image resolver for Guide: runs the ORDERED fallback chain
 *   Wikipedia pageimages -> Wikimedia Commons -> Google Places (dormant)
 * over `queries` (the free layers share the ordered list; the paid layer gets
 * the most-specific query). Returns the first hit or null. The synchronous
 * `coverPhoto(stop)` and the striped placeholder stay in the caller, so the
 * effective priority is coverPhoto -> pageimages -> Commons -> Places ->
 * placeholder.
 *
 * Additive companion to `useLandmarkImageQueries` (kept intact). Keyed on the
 * whole (trimmed, empties-dropped) query list so distinct stops don't collide;
 * cached for a day; disabled when the list is empty. Fails soft / never throws.
 * The Google layer no-ops to null until its function/key is deployed, so this
 * behaves exactly like the old pageimages-only path until then.
 */
export function useHeroImage(queries?: string[]): UseLandmarkImageResult {
  const list = (queries ?? []).map(q => q.trim()).filter(Boolean)
  const enabled = list.length > 0
  const placesQuery = list[0] ?? ''

  const result = useQuery({
    queryKey: ['hero-image', list],
    enabled,
    staleTime: ONE_DAY,
    gcTime: ONE_DAY,
    retry: 1,
    queryFn: () => resolveHeroImage(list, placesQuery),
  })

  return {
    url: result.data ?? null,
    loading: enabled && result.isLoading,
  }
}

/**
 * Like `useLandmarkImage`, but tries an ORDERED list of queries (most specific
 * first) via `fetchFirstLandmarkImage`, returning the first hit. Used by Guide's
 * hero so a recognizable place resolves "Name, Destination" → "Name, City" →
 * "Name" before falling back to the striped placeholder.
 *
 * Keyed on the whole (trimmed, empties-dropped) query list so distinct stops
 * don't collide; cached for a day; disabled when the list is empty. Fails soft.
 */
export function useLandmarkImageQueries(queries?: string[]): UseLandmarkImageResult {
  const list = (queries ?? []).map(q => q.trim()).filter(Boolean)
  const enabled = list.length > 0

  const result = useQuery({
    queryKey: ['landmark-first', list],
    enabled,
    staleTime: ONE_DAY,
    gcTime: ONE_DAY,
    retry: 1,
    queryFn: () => fetchFirstLandmarkImage(list),
  })

  return {
    url: result.data ?? null,
    loading: enabled && result.isLoading,
  }
}

/**
 * Eagerly warm the hero-image cache for a set of stops (each passed as its
 * ordered `heroQueries` list), so a later `useHeroImage` for any of them is an
 * instant cache hit — no per-stop API lag when opening or paging stops. Uses the
 * SAME key + queryFn as `useHeroImage`, so Plan, Guide and the stop detail share
 * one cache entry per stop. Fire-and-forget; fails soft.
 */
export function usePrefetchHeroImages(queriesList: string[][]) {
  const qc = useQueryClient()
  const lists = queriesList
    .map(q => q.map(s => s.trim()).filter(Boolean))
    .filter(l => l.length > 0)
  // Re-run only when the actual (trimmed, non-empty) query set changes.
  const signature = JSON.stringify(lists)
  useEffect(() => {
    for (const list of lists) {
      void qc.prefetchQuery({
        queryKey: ['hero-image', list],
        queryFn: () => resolveHeroImage(list, list[0] ?? ''),
        staleTime: ONE_DAY,
        gcTime: ONE_DAY,
        retry: 1,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc, signature])
}
