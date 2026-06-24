import { useQuery } from '@tanstack/react-query'
import { fetchPlaceDescription, type PlaceHints } from '../lib/enrichClient'
import { CURRENT_ENRICH_VERSION } from '../trip/placeCache/version'
import type { Stop } from '../types'
import type { EnrichState } from '../trip/placeCache/types'
import { stopCoords } from '../trip/walk'

const UI_POLL_BUDGET_MS = 12_000
const POLL_INTERVAL_MS = 1_500

export interface StopDescription { history: string; facts: string[]; tips: string; notice: string; state: EnrichState }

/**
 * The description for a stop. placeId stops read the shared library (cached,
 * pre-warmable, polls briefly while generating); by-name stops use their own
 * stored fields. While a placeId stop's library entry is generating/failed, fall
 * back to the stop's legacy stored fields if present. Never blocks.
 */
export function useStopDescription(stop: Stop | undefined): StopDescription {
  const placeId = stop?.placeId
  const legacy = { history: stop?.history ?? '', facts: stop?.facts ?? [], tips: stop?.tips ?? '', notice: stop?.notice ?? '' }
  const c = stop ? stopCoords(stop) : null
  const hints: PlaceHints = { name: stop?.name, ...(c ? { coords: c } : {}), ...(stop?.placeTypes ? { placeTypes: stop.placeTypes } : {}) }

  const q = useQuery({
    queryKey: ['place-desc', placeId, CURRENT_ENRICH_VERSION],
    enabled: !!placeId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    queryFn: ({ signal }) => fetchPlaceDescription(placeId!, hints, signal),
    refetchInterval: (query) => {
      const r = query.state.data
      if (r?.state !== 'pending') return false
      const elapsed = Date.now() - (query.state.dataUpdatedAt || Date.now())
      return elapsed < UI_POLL_BUDGET_MS ? POLL_INTERVAL_MS : false
    },
  })

  if (!placeId) return { ...legacy, state: 'ready' }
  const r = q.data
  if (r?.state === 'ready' && r.content) return { ...r.content, state: 'ready' }
  return { ...legacy, state: r?.state ?? 'pending' }
}
