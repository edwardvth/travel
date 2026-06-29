import { useCallback, useEffect, useState } from 'react'

/** True while the observed sentinel (placed by the hero pill) is on screen.
 *  Drives the "New trip" button visibility (spec §5.1).
 *
 *  Uses a callback ref so the observer (re)attaches whenever the sentinel mounts
 *  or unmounts — the hero pill can appear AFTER mount (e.g. the create hero rolls
 *  in on "+ New trip"), and a one-shot mount effect would miss it. */
export function useHeroPillInView<T extends Element>() {
  const [inView, setInView] = useState(true)
  const [el, setEl] = useState<T | null>(null)
  const ref = useCallback((node: T | null) => setEl(node), [])
  useEffect(() => {
    if (!el || typeof IntersectionObserver === 'undefined') return
    const obs = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.01 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [el])
  return { ref, inView }
}
