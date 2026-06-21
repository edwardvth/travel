import { useCallback, useEffect, useState } from 'react'

/**
 * Narration playback speeds, in cycle order. Resolved decision: speed is a
 * **local-only** preference (one value per device, in localStorage) — it does
 * NOT route through `useAccountSettings`/Supabase. It applies to BOTH the
 * ElevenLabs `<audio>.playbackRate` and the Web-Speech `utterance.rate`.
 */
export const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2] as const

export const NARRATION_SPEED_KEY = 'voyager:narrationSpeed'

/**
 * Advance to the next speed in the cycle, wrapping `2 → 0.75`. An unknown /
 * invalid current value is treated as the base `1`, so the result is the next
 * step after `1` (i.e. `1.25`). Pure.
 */
export function nextSpeed(s: number): number {
  const i = SPEEDS.indexOf(s as (typeof SPEEDS)[number])
  const from = i === -1 ? SPEEDS.indexOf(1) : i
  return SPEEDS[(from + 1) % SPEEDS.length]
}

/**
 * Parse a raw localStorage value into a known speed, clamping anything
 * unknown / unparseable / null to the default `1`. Pure.
 */
export function parseSpeed(raw: string | null): number {
  if (raw == null) return 1
  const n = Number(raw)
  if (!Number.isFinite(n)) return 1
  return (SPEEDS as readonly number[]).includes(n) ? n : 1
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

export interface UseNarrationSpeed {
  speed: number
  cycle: () => void
}

/**
 * Hook over `localStorage['voyager:narrationSpeed']`. Reads on mount, writes on
 * every cycle. Soft-fails like the `safeRead`/`safeWrite` pattern in
 * `useAccountSettings.ts` so the UI never blocks or throws.
 */
export function useNarrationSpeed(): UseNarrationSpeed {
  const [speed, setSpeed] = useState<number>(1)

  useEffect(() => {
    setSpeed(parseSpeed(safeRead(NARRATION_SPEED_KEY)))
  }, [])

  const cycle = useCallback(() => {
    setSpeed(prev => {
      const next = nextSpeed(prev)
      safeWrite(NARRATION_SPEED_KEY, String(next))
      return next
    })
  }, [])

  return { speed, cycle }
}
