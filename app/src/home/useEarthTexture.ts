import { useEffect, useState } from 'react'
import earthNightUrl from '../assets/earth-night.webp'

/**
 * Lazily fetch + decode the night-Earth WebP AFTER first paint and hand back the
 * decoded HTMLImageElement. This utility owns NO WebGL object — FieldGlobe owns
 * the GL texture (create/upload/restore). Returns null until the image is ready,
 * and no-ops cleanly when `Image` is unavailable (SSR/jsdom). The shader renders
 * fine without it (synthesized lights), so this is a pure enhancement.
 */
export function useEarthTexture(): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null)

  useEffect(() => {
    if (typeof Image === 'undefined') return
    let cancelled = false

    const load = () => {
      const im = new Image()
      im.decoding = 'async'
      im.onload = () => { if (!cancelled) setImg(im) }
      im.src = earthNightUrl
    }

    const ric = (globalThis as { requestIdleCallback?: (cb: () => void) => number })
      .requestIdleCallback
    let idleId: number | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    if (typeof ric === 'function') idleId = ric(load)
    else timer = setTimeout(load, 200)

    return () => {
      cancelled = true
      const cic = (globalThis as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback
      if (idleId !== undefined && typeof cic === 'function') cic(idleId)
      if (timer) clearTimeout(timer)
    }
  }, [])

  return img
}
