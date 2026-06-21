import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Global, per-user account settings. These are intentionally *not* trip-scoped:
 * the AI model/key and unit preference apply to the whole account and are
 * reachable from both the Dashboard and inside a Voyage (the AccountMenu lives
 * in both). Persisted in localStorage under `voyager:account:<userId>`.
 *
 * Note: nothing currently consumes these at runtime — the AI key is applied
 * server-side in the `ai-proxy` edge function — so this store is a clean home
 * for the values that used to live (unused) in `trip.config`.
 */
export type Units = 'metric' | 'imperial'

export interface AccountSettings {
  aiModel?: string
  aiKey?: string
  units?: Units
  voiceId?: string
}

const STORAGE_PREFIX = 'voyager:account:'

export function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`
}

/** Parse a raw localStorage string into a clean, typed AccountSettings. */
export function parseAccountSettings(raw: string | null): AccountSettings {
  if (!raw) return {}
  let obj: unknown
  try {
    obj = JSON.parse(raw)
  } catch {
    return {}
  }
  if (typeof obj !== 'object' || obj === null) return {}
  const rec = obj as Record<string, unknown>
  const out: AccountSettings = {}
  if (typeof rec.aiModel === 'string' && rec.aiModel) out.aiModel = rec.aiModel
  if (typeof rec.aiKey === 'string' && rec.aiKey) out.aiKey = rec.aiKey
  if (rec.units === 'metric' || rec.units === 'imperial') out.units = rec.units
  if (typeof rec.voiceId === 'string' && rec.voiceId) out.voiceId = rec.voiceId
  return out
}

/** Merge a partial patch into existing settings; `undefined`/empty clears a key. */
export function mergeAccountSettings(
  prev: AccountSettings,
  patch: Partial<AccountSettings>,
): AccountSettings {
  const next: AccountSettings = { ...prev }
  for (const k of Object.keys(patch) as (keyof AccountSettings)[]) {
    const v = patch[k]
    if (v === undefined || v === '') delete next[k]
    else (next as Record<string, unknown>)[k] = v
  }
  return next
}

/** Serialize to the canonical JSON we persist. */
export function serializeAccountSettings(s: AccountSettings): string {
  return JSON.stringify(s)
}

export interface UseAccountSettings {
  settings: AccountSettings
  setSettings: (patch: Partial<AccountSettings>) => void
}

/**
 * Hook: read on mount (per user id), write on change. Settings sync cross-device
 * through `profiles.settings` (Supabase) with localStorage as the offline cache:
 * on mount we seed from the cache immediately, then overlay the server row when
 * it arrives; writes go through to both the cache and Supabase. The Supabase
 * layer is best-effort — every call soft-fails so the UI never blocks or throws.
 * When there's no signed-in user id, this degrades to in-memory only.
 */
export function useAccountSettings(userId: string | undefined): UseAccountSettings {
  const [settings, setState] = useState<AccountSettings>({})

  useEffect(() => {
    if (!userId) {
      setState({})
      return
    }
    // Seed synchronously from the offline cache (optimistic).
    setState(parseAccountSettings(safeRead(storageKey(userId))))

    // Then overlay the cross-device row from Supabase (best-effort).
    let cancelled = false
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('settings')
          .eq('id', userId)
          .maybeSingle()
        if (cancelled || error || !data?.settings) return
        const remote = parseAccountSettings(serializeAccountSettings(data.settings as AccountSettings))
        setState(remote)
        safeWrite(storageKey(userId), serializeAccountSettings(remote))
      } catch {
        /* offline / no row — keep the cached seed */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [userId])

  const setSettings = useCallback(
    (patch: Partial<AccountSettings>) => {
      setState(prev => {
        const next = mergeAccountSettings(prev, patch)
        if (userId) {
          safeWrite(storageKey(userId), serializeAccountSettings(next))
          // Write through to Supabase (best-effort, errors ignored).
          void supabase.from('profiles').update({ settings: next }).eq('id', userId).then(
            () => {},
            () => {},
          )
        }
        return next
      })
    },
    [userId],
  )

  return { settings, setSettings }
}

function safeRead(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeWrite(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* storage unavailable (private mode / quota) — degrade silently */
  }
}
