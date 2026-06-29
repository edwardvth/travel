import { useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Trip, TripConfig, Profile } from '../types'
import { byTripDate, isPastTrip, buildNewTripPayload, slugify, type NewTripInput } from '../lib/trip-helpers'
import { resolveCoverImage, COVER_LOGIC_VERSION } from '../trip/cover-image'
import { coverImageQueries, classifyCover } from '../trip/landmark-context'
import { inferDestination } from '../trip/destination'
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

/** Max insert attempts before giving up on a slug collision. */
const SLUG_RETRY_LIMIT = 5

export function useCreateTrip() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: NewTripInput) => {
      // The slug/id is derived from the title (never shown). On a PK collision
      // (`slug_taken`) we retry with a bounded suffix sequence — `-2`, `-3`, …
      // then a random base-36 token — so a clean URL is used when free and only
      // suffixed when taken; the id PK guarantees the insert eventually succeeds.
      const base = slugify(input.title)
      let lastReason = 'create_failed'
      for (let attempt = 0; attempt < SLUG_RETRY_LIMIT; attempt++) {
        const slug =
          attempt === 0 ? base
          : attempt < SLUG_RETRY_LIMIT - 1 ? `${base}-${attempt + 1}`
          : `${base}-${Math.random().toString(36).slice(2, 8)}`
        const p = buildNewTripPayload({ ...input, slug })
        const { data, error } = await supabase.rpc('create_trip', {
          p_id: p.id, p_title: p.title, p_subtitle: p.subtitle, p_config: p.config, p_data: p.data,
        })
        if (error) throw new Error(error.message)
        if (data && data.ok === true) {
          qc.invalidateQueries({ queryKey: ['trips'] })
          return p.id
        }
        lastReason = data?.reason || 'create_failed'
        // Only a slug collision is retryable — any other reason fails fast.
        if (lastReason !== 'slug_taken') throw new Error(lastReason)
      }
      throw new Error(lastReason)
    },
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
        const resolved = await resolveCoverImage(queries)
        if (!resolved) return false
        const { data: row } = await supabase.from('trips').select('config').eq('id', trip.id).maybeSingle()
        const config = (row?.config ?? {}) as TripConfig
        if (config.coverImage) return false // don't clobber an existing cover
        const { error } = await supabase
          .from('trips')
          .update({ config: { ...config, coverImage: resolved.url, coverSource: resolved.source, coverVersion: COVER_LOGIC_VERSION } })
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

/**
 * Fire-and-forget: for a legacy trip with NO `config.destination` but with stops,
 * infer the destination from the stops (AI, with a deterministic address-parse
 * fallback — see `inferDestination`) and persist it to `config.destination`. One
 * write cascades everywhere the app reads `destinationOf` (home cover, Plan, Guide).
 * Re-reads the row first so it never clobbers a destination set meanwhile.
 * Owner/RLS-gated; silent. Resolves true when a destination was written.
 */
export function useBackfillDestination() {
  const qc = useQueryClient()
  return useCallback(
    async (trip: CoverableTrip): Promise<boolean> => {
      if (!trip.id) return false
      const hasDest = typeof trip.config?.destination === 'string' && trip.config.destination.trim().length > 0
      const stops = trip.data?.days?.flatMap(d => d.stops ?? []) ?? []
      if (hasDest || stops.length === 0) return false
      try {
        const dest = await inferDestination(stops, trip.title ?? '')
        if (!dest) return false
        const { data: row } = await supabase.from('trips').select('config').eq('id', trip.id).maybeSingle()
        const config = (row?.config ?? {}) as TripConfig
        if (typeof config.destination === 'string' && config.destination.trim()) return false
        const { error } = await supabase
          .from('trips')
          .update({ config: { ...config, destination: dest } })
          .eq('id', trip.id)
        if (error) return false
        qc.invalidateQueries({ queryKey: ['trips'] })
        return true
      } catch {
        return false
      }
    },
    [qc],
  )
}

/**
 * Fire-and-forget: re-resolve a trip's AUTO (Wikipedia-hotlink) cover from its
 * current destination-first `coverImageQueries`, OVERWRITING the saved value —
 * the deliberate counterpart to `useBackfillCoverImage`'s "never clobber" guard.
 * Only runs when the saved cover is `'auto'` (a `data:` user upload, or any other
 * URL, is left untouched). Re-reads the row so it uses the freshest destination
 * (e.g. one `useBackfillDestination` just wrote). Clears the cover when nothing
 * resolves so the live destination landmark shows. Owner/RLS-gated; silent.
 */
export function useReresolveAutoCover() {
  const qc = useQueryClient()
  return useCallback(
    async (trip: CoverableTrip): Promise<boolean> => {
      if (!trip.id) return false
      try {
        const { data: row } = await supabase
          .from('trips').select('config, data, title').eq('id', trip.id).maybeSingle()
        if (!row) return false
        const config = (row.config ?? {}) as TripConfig
        if (classifyCover(config.coverImage) !== 'auto') return false // never touch user/other
        if (config.coverVersion === COVER_LOGIC_VERSION) return false // already on current cover logic — don't re-fetch
        const queries = coverImageQueries({
          title: (row.title as string | undefined) ?? trip.title,
          config,
          data: (row.data ?? trip.data) as Trip['data'],
        })
        const resolved = await resolveCoverImage(queries)
        const next: TripConfig = { ...config }
        if (resolved) { next.coverImage = resolved.url; next.coverSource = resolved.source; next.coverVersion = COVER_LOGIC_VERSION }
        else { delete next.coverImage; delete next.coverSource; delete next.coverVersion }
        if (next.coverImage === config.coverImage && next.coverSource === config.coverSource && next.coverVersion === config.coverVersion) return false
        const { error } = await supabase.from('trips').update({ config: next }).eq('id', trip.id)
        if (error) return false
        qc.invalidateQueries({ queryKey: ['trips'] })
        return true
      } catch {
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
