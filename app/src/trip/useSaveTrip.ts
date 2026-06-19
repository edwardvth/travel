import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Trip, TripConfig, TripData } from '../types'
import { tripKey } from './useTrip'

const DEBOUNCE_MS = 800

export interface SavePartial {
  title?: string
  subtitle?: string | null
  config?: TripConfig
  data?: TripData
}

export interface UseSaveTripResult {
  save: (partial: SavePartial) => void
  /** Immediately write any pending debounced change (used on unmount / leaving the planner). */
  flush: () => void
  saving: boolean
  lastSavedAt: string | null
  error: Error | null
}

/**
 * Debounced autosave for a trip. Merges `partial` into the cached trip (optimistic),
 * stamps `data.savedAt`, then upserts `{ id, title, subtitle, config, data }`.
 * No-ops when `canEdit` is false. Mirrors Trip.html cloudSave.
 */
export function useSaveTrip(tripId: string | undefined, canEdit: boolean): UseSaveTripResult {
  const qc = useQueryClient()
  const [saving, setSaving] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const [error, setError] = useState<Error | null>(null)

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<Trip | null>(null)
  const mounted = useRef(true)

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    const next = pending.current
    pending.current = null
    if (!next || !tripId || !canEdit) return
    if (mounted.current) {
      setSaving(true)
      setError(null)
    }
    // Fire the upsert immediately. Awaited internally so it completes even when
    // the component has unmounted (we just skip state updates in that case).
    void (async () => {
      try {
        const { error: upsertError } = await supabase
          .from('trips')
          .upsert(
            { id: tripId, title: next.title, subtitle: next.subtitle, config: next.config, data: next.data },
            { onConflict: 'id' },
          )
        if (upsertError) throw new Error(upsertError.message)
        if (mounted.current) setLastSavedAt(next.data?.savedAt ?? new Date().toISOString())
      } catch (e) {
        if (mounted.current) setError(e instanceof Error ? e : new Error(String(e)))
      } finally {
        if (mounted.current) setSaving(false)
      }
    })()
  }, [tripId, canEdit])

  // On unmount, flush any pending debounced change rather than dropping it.
  // This prevents losing edits when the planner (or a sub-view) unmounts.
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      flush()
    }
  }, [flush])

  const save = useCallback((partial: SavePartial) => {
    if (!tripId || !canEdit) return
    const current = qc.getQueryData<Trip>(tripKey(tripId))
    if (!current) return

    const merged: Trip = {
      ...current,
      ...(partial.title !== undefined ? { title: partial.title } : null),
      ...(partial.subtitle !== undefined ? { subtitle: partial.subtitle } : null),
      ...(partial.config !== undefined ? { config: partial.config } : null),
      ...(partial.data !== undefined ? { data: partial.data } : null),
    }
    // Stamp savedAt so realtime peers can resolve last-write-wins.
    merged.data = { ...merged.data, savedAt: new Date().toISOString() }

    // Optimistic cache update so the UI reflects the edit immediately.
    qc.setQueryData<Trip>(tripKey(tripId), merged)
    pending.current = merged

    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { flush() }, DEBOUNCE_MS)
  }, [tripId, canEdit, qc, flush])

  return { save, flush, saving, lastSavedAt, error }
}
