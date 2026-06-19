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

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const flush = useCallback(async () => {
    const next = pending.current
    pending.current = null
    if (!next || !tripId || !canEdit) return
    setSaving(true)
    setError(null)
    try {
      const { error: upsertError } = await supabase
        .from('trips')
        .upsert(
          { id: tripId, title: next.title, subtitle: next.subtitle, config: next.config, data: next.data },
          { onConflict: 'id' },
        )
      if (upsertError) throw new Error(upsertError.message)
      setLastSavedAt(next.data?.savedAt ?? new Date().toISOString())
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setSaving(false)
    }
  }, [tripId, canEdit, qc])

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
    timer.current = setTimeout(() => { void flush() }, DEBOUNCE_MS)
  }, [tripId, canEdit, qc, flush])

  return { save, saving, lastSavedAt, error }
}
