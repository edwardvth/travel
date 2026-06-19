import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/useAuth'
import { useProfile, isFounder } from '../data/useProfile'
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

  // Realtime: refetch on any remote change to this trip row (last-write-wins).
  useEffect(() => {
    if (!tripId) return
    const channel = supabase
      .channel('trip-' + tripId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trips', filter: 'id=eq.' + tripId },
        () => { qc.invalidateQueries({ queryKey: tripKey(tripId) }) },
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
