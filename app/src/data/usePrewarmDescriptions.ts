import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { fetchPlaceDescriptionsBatch } from '../lib/enrichClient'
import { CURRENT_ENRICH_VERSION } from '../trip/placeCache/version'

/** Max placeIds warmed in one batch — keeps large trips from flooding requests. */
export const PREWARM_BATCH_MAX = 25

/**
 * Pre-warm the description cache for a bounded set of placeIds (e.g. the active
 * day's stops). One `getBatch` (ready hits only — never generates), seeded into
 * the same TanStack cache `useStopDescription` reads, so opening a stop is
 * instant. De-dupes and caps at PREWARM_BATCH_MAX.
 */
export function usePrewarmDescriptions(placeIds: Array<string | undefined>): void {
  const qc = useQueryClient()
  const ids = Array.from(new Set(placeIds.filter((x): x is string => !!x))).slice(0, PREWARM_BATCH_MAX)
  const key = ids.join(',')
  useEffect(() => {
    if (ids.length === 0) return
    let cancelled = false
    void (async () => {
      const map = await fetchPlaceDescriptionsBatch(ids)
      if (cancelled) return
      for (const [placeId, content] of Object.entries(map)) {
        qc.setQueryData(['place-desc', placeId, CURRENT_ENRICH_VERSION], { state: 'ready', content })
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
}
