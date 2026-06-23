import { useEffect, useState } from 'react'

/**
 * Reactive media-query match. jsdom/SSR-safe (defaults to `false` when
 * `matchMedia` is unavailable). Used to pick the right time-edit surface:
 * an anchored popover on desktop, a bottom-sheet wheel picker on mobile.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false,
  )

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}
