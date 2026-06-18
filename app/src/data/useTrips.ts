import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Trip, Profile } from '../types'
import { byTripDate, isPastTrip, buildNewTripPayload, type NewTripInput } from '../lib/trip-helpers'
import { isFounder } from './useProfile'

export function splitTrips(trips: Trip[]) {
  const sorted = [...trips].sort(byTripDate)
  return { upcoming: sorted.filter(t => !isPastTrip(t)), past: sorted.filter(isPastTrip) }
}

const COLS = 'id, owner_id, title, subtitle, config, data, updated_at'

export function useTrips(userId: string | undefined, profile: Profile | null | undefined) {
  return useQuery({
    queryKey: ['trips', userId, profile?.role],
    enabled: !!userId,
    queryFn: async (): Promise<Trip[]> => {
      if (isFounder(profile)) {
        const { data } = await supabase.from('trips').select(COLS).order('updated_at', { ascending: false })
        return (data as Trip[]) ?? []
      }
      const { data } = await supabase.from('trips').select(COLS)
      const all = (data as Trip[]) ?? []
      const memberIds = new Set<string>()
      const { data: mems } = await supabase.from('trip_members').select('trip_id')
      ;(mems ?? []).forEach((m: { trip_id: string }) => memberIds.add(m.trip_id))
      const mine = all
        .filter(t => (t.owner_id && t.owner_id === userId) || memberIds.has(t.id))
        .map(t => ({ ...t, _shared: !(t.owner_id && t.owner_id === userId) }))
      const sharedIds = mine.filter(t => t._shared).map(t => t.id)
      if (sharedIds.length) {
        const { data: owners } = await supabase.rpc('trip_owner_emails', { p_ids: sharedIds })
        const map: Record<string, string> = {}
        ;(owners ?? []).forEach((o: { trip_id: string; owner_email: string }) => { map[o.trip_id] = o.owner_email })
        mine.forEach(t => { if (t._shared) t._ownerEmail = map[t.id] ?? null })
      }
      return mine
    },
  })
}

export function useCreateTrip() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: NewTripInput) => {
      const p = buildNewTripPayload(input)
      const { data, error } = await supabase.rpc('create_trip', {
        p_id: p.id, p_title: p.title, p_subtitle: p.subtitle, p_config: p.config, p_data: p.data,
      })
      if (error) throw new Error(error.message)
      if (!data || data.ok !== true) throw new Error(data?.reason || 'create_failed')
      return p.id
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trips'] }),
  })
}

export function useDeleteTrip() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc('delete_trip', { p_id: id })
      if (error) throw new Error(error.message)
      if (!data || data.ok !== true) throw new Error(data?.reason || 'delete_failed')
      return id
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trips'] }),
  })
}
