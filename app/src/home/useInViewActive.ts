import { useCallback, useEffect, useState } from 'react'

/**
 * Coordinates the "one animated background at a time" guarantee (spec §5.2).
 * Attach `globeRef` (a CALLBACK ref) to the globe region. While the globe region
 * is NOT in view the hero is active (video plays, globe paused); once the globe
 * region scrolls in, the globe becomes active and the hero deactivates (video
 * pauses). Using a callback ref + state means the observer attaches exactly when
 * the node mounts (and re-attaches if it changes), with no per-render churn.
 */
export function useInViewActive() {
  const [globeEl, setGlobeEl] = useState<HTMLElement | null>(null)
  const globeRef = useCallback((el: HTMLElement | null) => { setGlobeEl(el) }, [])
  const [globeActive, setGlobeActive] = useState(false)

  useEffect(() => {
    if (!globeEl || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) setGlobeActive(e.isIntersecting)
      },
      { threshold: 0.01 },
    )
    io.observe(globeEl)
    return () => io.disconnect()
  }, [globeEl])

  return { globeRef, globeActive, heroActive: !globeActive }
}
