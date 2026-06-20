import { useQuery } from '@tanstack/react-query'
import { fetchPhotonPlaces } from '../lib/photon'

/** A day in ms — place suggestions are effectively static, so we cache hard. */
const ONE_DAY = 24 * 60 * 60 * 1000
/** Minimum query length before we hit Photon (keeps us within fair-use). */
const MIN_QUERY = 3

export interface UsePlaceSearchResult {
  /** Clean place labels for the query (empty until loaded / on a miss). */
  places: string[]
  loading: boolean
}

/**
 * Destination autocomplete for a `query`. Backed by TanStack Query, keyed on
 * the lowercased query and cached for a day (suggestions are static), so the
 * dropdown can ask repeatedly without hammering Photon. Only enabled at ≥3
 * chars; fails soft (a miss or error resolves to `[]`). Mirrors
 * `useLandmarkImage`.
 *
 * Debounce + in-flight cancellation live in the consuming component
 * (`DestinationInput`); this hook just caches the resolved query.
 */
export function usePlaceSearch(query?: string): UsePlaceSearchResult {
  const q = query?.trim() ?? ''
  const enabled = q.length >= MIN_QUERY

  const result = useQuery({
    queryKey: ['places', q.toLowerCase()],
    enabled,
    staleTime: ONE_DAY,
    gcTime: ONE_DAY,
    retry: 1,
    // Forward TanStack's AbortSignal so a superseded query cancels its in-flight fetch.
    queryFn: ({ signal }) => fetchPhotonPlaces(q, signal),
  })

  return {
    places: result.data ?? [],
    loading: enabled && result.isLoading,
  }
}
