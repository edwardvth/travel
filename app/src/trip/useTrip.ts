import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/useAuth'
import { useProfile, isFounder } from '../data/useProfile'
import { mergeRealtimeTrip } from './realtime-merge'
import type { Trip } from '../types'

export interface UseTripResult {
  trip: Trip | null
  isLoading: boolean
  error: Error | null
  canEdit: boolean
  refetch: () => void
}

export function tripKey(tripId: string | undefined) {
  return ['trip', tripId] as const
}

/**
 * Load a single trip row + subscribe to realtime changes (last-write-wins) and
 * compute `canEdit` (founder OR owner OR member). Mirrors Trip.html cloudLoad.
 */
export function useTrip(tripId: string | undefined): UseTripResult {
  const { user } = useAuth()
  const { data: profile } = useProfile(user?.id)
  const qc = useQueryClient()

  const tripQuery = useQuery({
    queryKey: tripKey(tripId),
    enabled: !!tripId,
    queryFn: async (): Promise<Trip | null> => {
      const { data, error } = await supabase
        .from('trips')
        .select('*')
        .eq('id', tripId)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return (data as Trip) ?? null
    },
  })

  const trip = tripQuery.data ?? null
  const isOwner = !!user?.id && !!trip?.owner_id && trip.owner_id === user.id

  // Membership check — only needed when not already owner/founder.
  const needMembership = !!tripId && !!user?.id && !isOwner && !isFounder(profile)
  const memberQuery = useQuery({
    queryKey: ['trip-member', tripId, user?.id],
    enabled: needMembership,
    queryFn: async (): Promise<boolean> => {
      // RLS scopes trip_members rows to the current user (matches Phase 1
      // useTrips + legacy). A returned row for this trip = I'm a member.
      const { data } = await supabase
        .from('trip_members')
        .select('trip_id')
        .eq('trip_id', tripId)
        .maybeSingle()
      return !!data
    },
  })

  const canEdit = isFounder(profile) || isOwner || memberQuery.data === true

  // Realtime: apply remote changes to this trip row with real last-write-wins.
  //
  // A blind `invalidateQueries` here clobbers the cache: Supabase echoes the
  // client's own debounced saves back, and a full refetch then replaces our
  // *newer* optimistic edits (e.g. a just-marked `completed`) with the older
  // committed server row — the Guide "checkmark snaps back" race. Instead we
  // patch the cache directly via `mergeRealtimeTrip`, which keeps the row only
  // when its `data.savedAt` is strictly newer than what we hold (so own/older
  // echoes are dropped, genuine remote edits from another device still apply).
  //
  // `payload.new` carries the full new row for INSERT/UPDATE under Postgres'
  // default replica identity (FULL only changes the `old` record), so no schema
  // change is needed. We keep a defensive `invalidate` fallback for the unlikely
  // case the row arrives without `data`, and for DELETE (rare; refetch → null).
  useEffect(() => {
    if (!tripId) return
    const channel = supabase
      .channel('trip-' + tripId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trips', filter: 'id=eq.' + tripId },
        payload => {
          const row = payload.new as Trip | undefined
          if (payload.eventType === 'DELETE' || !row?.data) {
            qc.invalidateQueries({ queryKey: tripKey(tripId) })
            return
          }
          qc.setQueryData<Trip | null>(tripKey(tripId), prev => mergeRealtimeTrip(prev, row))
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [tripId, qc])

  return {
    trip,
    isLoading: tripQuery.isLoading,
    error: (tripQuery.error as Error) ?? null,
    canEdit,
    refetch: () => { tripQuery.refetch() },
  }
}
