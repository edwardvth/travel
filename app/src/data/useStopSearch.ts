import { useQuery } from '@tanstack/react-query'
import { fetchPredictions, type Prediction, type SearchRegion } from '../lib/placeSearch'

const MIN_QUERY = 3
const SESSION_STALE = 5 * 60 * 1000 // predictions are stable within a typing session

export interface UseStopSearchResult {
  predictions: Prediction[]
  loading: boolean
}

/**
 * Autocomplete predictions for `query`, country-scoped + proximity-biased by
 * `region`, billed under `sessionToken`. Enabled at ≥3 chars; fails soft to [].
 * Debounce + in-flight cancellation live in the consuming component
 * (`StopSearchInput`). Mirrors `usePlaceSearch`.
 */
export function useStopSearch(query: string, region: SearchRegion, sessionToken: string): UseStopSearchResult {
  const q = query.trim()
  const enabled = q.length >= MIN_QUERY
  const result = useQuery({
    queryKey: ['place-search', q.toLowerCase(), region.countryCode, region.lat, region.lng, sessionToken],
    enabled,
    staleTime: SESSION_STALE,
    gcTime: SESSION_STALE,
    retry: 1,
    queryFn: ({ signal }) => fetchPredictions(q, sessionToken, region, signal),
  })
  return { predictions: result.data ?? [], loading: enabled && result.isLoading }
}
