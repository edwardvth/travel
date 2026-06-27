import { useEffect, useRef, useState } from 'react'

/** True while the observed sentinel (placed by the hero pill) is on screen.
 *  Drives the header "New trip" button visibility (spec §5.1). */
export function useHeroPillInView<T extends Element>() {
  const ref = useRef<T | null>(null)
  const [inView, setInView] = useState(true)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const obs = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.01 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return { ref, inView }
}
