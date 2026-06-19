let fired = false
const EVENT = 'voyager:hero-ready'

/** Fire once: the hero background is now actually showing (video playing or poster painted). */
export function signalHeroReady(): void {
  if (fired) return
  fired = true
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT))
}

/** Subscribe; fires immediately (async) if already ready. Returns an unsubscribe fn. */
export function onHeroReady(cb: () => void): () => void {
  if (fired) {
    const t = setTimeout(cb, 0)
    return () => clearTimeout(t)
  }
  if (typeof window === 'undefined') return () => {}
  const handler = () => cb()
  window.addEventListener(EVENT, handler, { once: true })
  return () => window.removeEventListener(EVENT, handler)
}

/** test-only reset */
export function _resetHeroReady(): void {
  fired = false
}
