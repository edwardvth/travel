import { useCallback, useEffect, useState } from 'react'

/**
 * Hero background mode. `cinematic` = looping video/poster; `explorer` = the
 * dark world-map with glowing nodes + travel arcs.
 */
export type HeroMode = 'cinematic' | 'explorer'

const STORAGE_KEY = 'voyager-hero-mode'
const DEFAULT: HeroMode = 'cinematic'

function isHeroMode(value: unknown): value is HeroMode {
  return value === 'cinematic' || value === 'explorer'
}

/** SSR/jsdom-safe read of the persisted mode. */
function readStored(): HeroMode {
  if (typeof window === 'undefined' || !window.localStorage) return DEFAULT
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return isHeroMode(raw) ? raw : DEFAULT
  } catch {
    return DEFAULT
  }
}

/**
 * `[mode, setMode]` backed by localStorage (`voyager-hero-mode`).
 * Defaults to `cinematic`, persists on change, and is safe to call when there
 * is no `window`/`localStorage`.
 */
export function useHeroMode(): [HeroMode, (m: HeroMode) => void] {
  const [mode, setModeState] = useState<HeroMode>(readStored)

  // Reconcile once on mount in case the server-rendered default differs from
  // what's actually persisted in the browser.
  useEffect(() => {
    const stored = readStored()
    if (stored !== mode) setModeState(stored)
    // Mount-only reconcile.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setMode = useCallback((m: HeroMode) => {
    setModeState(m)
    if (typeof window === 'undefined' || !window.localStorage) return
    try {
      window.localStorage.setItem(STORAGE_KEY, m)
    } catch {
      /* private mode / quota — keep the in-memory value */
    }
  }, [])

  return [mode, setMode]
}

export default useHeroMode
