import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Trip, TripConfig, TripData } from '../types'
import { tripKey } from './useTrip'

const DEBOUNCE_MS = 800
/** Backoff delays (ms) for retrying a failed upsert, indexed by consecutive fail count, capped at the last. */
const RETRY_BACKOFF_MS = [3000, 8000, 20000, 60000]

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
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const failCount = useRef(0)
  const pending = useRef<Trip | null>(null)
  const mounted = useRef(true)

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    // A new flush supersedes any scheduled retry; we're about to attempt a write now.
    if (retryTimer.current) {
      clearTimeout(retryTimer.current)
      retryTimer.current = null
    }
    const next = pending.current
    // Capture the payload but DON'T null `pending` yet — only a successful write
    // is allowed to clear it, so a failure can re-queue without losing the edit.
    if (!next || !tripId || !canEdit) {
      pending.current = null
      return
    }
    if (mounted.current) {
      setSaving(true)
      setError(null)
    }
    // Fire the upsert immediately. Awaited internally so it completes even when
    // the component has unmounted (we just skip state updates in that case).
    void (async () => {
      let ok = false
      let failure: Error | null = null
      try {
        const { error: upsertError } = await supabase
          .from('trips')
          .upsert(
            { id: tripId, title: next.title, subtitle: next.subtitle, config: next.config, data: next.data },
            { onConflict: 'id' },
          )
        if (upsertError) throw new Error(upsertError.message)
        ok = true
      } catch (e) {
        failure = e instanceof Error ? e : new Error(String(e))
      }

      if (ok) {
        // Only clear `pending` for the payload we actually wrote. If a newer edit
        // landed while we were in flight, leave it queued and let the debounce flush it.
        if (pending.current === next) pending.current = null
        failCount.current = 0
        if (mounted.current) {
          setError(null)
          setLastSavedAt(next.data?.savedAt ?? new Date().toISOString())
          setSaving(false)
        }
        return
      }

      // Failure: restore the payload into `pending` so the edit isn't dropped.
      // Newest wins — if a newer pending edit exists, keep it (it already
      // supersedes this stale payload); otherwise re-queue what we just tried.
      if (pending.current === null) pending.current = next
      if (mounted.current) {
        setError(failure)
        setSaving(false)
        // Schedule a real retry with backoff so SyncIndicator's "retrying" is truthful.
        const delay = RETRY_BACKOFF_MS[Math.min(failCount.current, RETRY_BACKOFF_MS.length - 1)]
        failCount.current += 1
        if (retryTimer.current) clearTimeout(retryTimer.current)
        retryTimer.current = setTimeout(() => {
          retryTimer.current = null
          flush()
        }, delay)
      }
    })()
  }, [tripId, canEdit])

  // On unmount, flush any pending debounced change rather than dropping it.
  // This prevents losing edits when the planner (or a sub-view) unmounts.
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      // Clear the backoff timer so a pending retry can't fire after unmount.
      if (retryTimer.current) {
        clearTimeout(retryTimer.current)
        retryTimer.current = null
      }
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
