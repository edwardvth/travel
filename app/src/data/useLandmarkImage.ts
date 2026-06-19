import { useQuery } from '@tanstack/react-query'
import { fetchLandmarkImage } from '../trip/landmark'

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
