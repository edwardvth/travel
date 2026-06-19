import { useCallback, useEffect, useState } from 'react'

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
 * Hook: read on mount (per user id), write on change. When there's no signed-in
 * user id, this degrades to in-memory only (nothing is persisted).
 */
export function useAccountSettings(userId: string | undefined): UseAccountSettings {
  const [settings, setState] = useState<AccountSettings>({})

  useEffect(() => {
    if (!userId) {
      setState({})
      return
    }
    setState(parseAccountSettings(safeRead(storageKey(userId))))
  }, [userId])

  const setSettings = useCallback(
    (patch: Partial<AccountSettings>) => {
      setState(prev => {
        const next = mergeAccountSettings(prev, patch)
        if (userId) safeWrite(storageKey(userId), serializeAccountSettings(next))
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
