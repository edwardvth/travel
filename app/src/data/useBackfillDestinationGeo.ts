import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { resolveRegion } from '../trip/region'
import type { TripConfig } from '../types'

/**
 * Resolve `destination` to its RegionGeo and persist it as `config.destinationGeo`
 * (immutably) on the given trip. Fire-and-forget, edit-gated by the caller; a
 * miss is a no-op (autocomplete falls back to country-less). Mirrors
 * useBackfillCoverImage's config-patch shape.
 */
export function useBackfillDestinationGeo() {
  const qc = useQueryClient()
  return useCallback(async (args: { id: string; destination: string; config: TripConfig }) => {
    const geo = await resolveRegion(args.destination)
    if (!geo) return
    const { error } = await supabase
      .from('trips')
      .update({ config: { ...args.config, destinationGeo: geo } })
      .eq('id', args.id)
    if (!error) void qc.invalidateQueries({ queryKey: ['trips'] })
  }, [qc])
}
