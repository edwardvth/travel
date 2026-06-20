import { useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Trip, TripConfig, Profile } from '../types'
import { byTripDate, isPastTrip, buildNewTripPayload, type NewTripInput } from '../lib/trip-helpers'
import { fetchLandmarkImage } from '../trip/landmark'
import { coverImageQueries } from '../trip/landmark-context'
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

/** A trip (or just the parts) we can derive cover-image queries from. */
type CoverableTrip = Pick<Trip, 'id' | 'title' | 'config' | 'data'>

/**
 * Fire-and-forget: fetch a landmark cover image for a trip and persist it to
 * `config.coverImage`. Tries `coverImageQueries(trip)` in order — the first
 * few stop names alone (famous landmarks resolve best by name) then the trip's
 * destination with abbreviations expanded ("stl" → "St. Louis") — and keeps the
 * first query that returns a URL.
 *
 * Non-blocking and silent — any miss (no image, network, write failure) is
 * swallowed so the caller is never affected. Re-reads the row first so it only
 * sets `coverImage` when the trip still has none (never clobbers a user-set
 * cover); the write is owner/RLS-gated by the `trips` policy. Resolves to true
 * when a cover was persisted, false otherwise, and invalidates the trips list
 * on success so cards pick up the new cover.
 */
export function useBackfillCoverImage() {
  const qc = useQueryClient()
  return useCallback(
    async (trip: CoverableTrip): Promise<boolean> => {
      if (!trip.id) return false
      const queries = coverImageQueries(trip)
      if (queries.length === 0) return false
      try {
        let url: string | null = null
        for (const q of queries) {
          url = await fetchLandmarkImage(q)
          if (url) break
        }
        if (!url) return false
        const { data: row } = await supabase.from('trips').select('config').eq('id', trip.id).maybeSingle()
        const config = (row?.config ?? {}) as TripConfig
        if (config.coverImage) return false // don't clobber an existing cover
        const { error } = await supabase
          .from('trips')
          .update({ config: { ...config, coverImage: url } })
          .eq('id', trip.id)
        if (error) return false
        qc.invalidateQueries({ queryKey: ['trips'] })
        return true
      } catch {
        /* cover is best-effort — the home card backfills on-demand if this misses */
        return false
      }
    },
    [qc],
  )
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
