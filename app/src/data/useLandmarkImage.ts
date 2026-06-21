import { useQuery } from '@tanstack/react-query'
import { fetchLandmarkImage, fetchFirstLandmarkImage } from '../trip/landmark'

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
