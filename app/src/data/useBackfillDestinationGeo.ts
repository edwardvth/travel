import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { resolveRegion } from '../trip/region'
import type { TripConfig } from '../types'

/**
 * Resolve `destination` to its RegionGeo and persist it as `config.destinationGeo`.
 * Re-reads the live config from Supabase first (mirrors useBackfillCoverImage) and
 * merges, so it never clobbers other config fields. Fire-and-forget; a miss is a
 * no-op. Overwrites any existing destinationGeo (the edit path relies on this).
 */
export function useBackfillDestinationGeo() {
  const qc = useQueryClient()
  return useCallback(async (args: { id: string; destination: string }) => {
    const geo = await resolveRegion(args.destination)
    if (!geo) return
    const { data: row } = await supabase.from('trips').select('config').eq('id', args.id).maybeSingle()
    const config = (row?.config ?? {}) as TripConfig
    const { error } = await supabase
      .from('trips')
      .update({ config: { ...config, destinationGeo: geo } })
      .eq('id', args.id)
    if (!error) void qc.invalidateQueries({ queryKey: ['trips'] })
  }, [qc])
}
