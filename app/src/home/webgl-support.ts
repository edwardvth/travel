/**
 * Memoized WebGL2 feature detection. Creates a throwaway canvas once and caches
 * the result. Safe in SSR/jsdom (returns false when document/canvas/context are
 * unavailable). The cache is keyed to the module, so repeated renders don't
 * allocate canvases.
 */
let cached: boolean | undefined

export function supportsWebGL2(): boolean {
  if (cached !== undefined) return cached
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    cached = false
    return cached
  }
  try {
    const canvas = document.createElement('canvas')
    cached = !!canvas.getContext?.('webgl2')
  } catch {
    cached = false
  }
  return cached
}

/** Test-only: reset the memoized result. */
export function __resetWebGL2Cache() {
  cached = undefined
}
