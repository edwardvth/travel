import type { Stop } from '../types'

/** Hard cap on the longest edge of a stored photo, in CSS px. */
export const MAX_EDGE = 1200
/** JPEG export quality for resized photos (legacy used 0.65; 0.8 is a touch nicer). */
export const JPEG_QUALITY = 0.8
/** Ignore absurdly large inputs to keep the resize cheap and the data URL bounded. */
export const MAX_INPUT_BYTES = 25 * 1024 * 1024

/**
 * Scale `w`×`h` so the longest edge is ≤ `max`, preserving aspect ratio and
 * never upscaling. Returns integer pixel dimensions (each ≥ 1). Pure +
 * unit-tested — this is the geometry half of `resizeToDataUrl`.
 */
export function scaledDims(w: number, h: number, max = MAX_EDGE): { w: number; h: number } {
  // Degenerate input → a 1×1 floor so callers never get a zero-size canvas.
  if (!(w > 0) || !(h > 0)) return { w: 1, h: 1 }
  const scale = Math.min(1, max / Math.max(w, h))
  return {
    w: Math.max(1, Math.round(w * scale)),
    h: Math.max(1, Math.round(h * scale)),
  }
}

/** Options for {@link resizeToDataUrl}. */
export interface ResizeOpts {
  /** Longest-edge cap in px (default {@link MAX_EDGE}). */
  max?: number
  /** JPEG quality 0–1 (default {@link JPEG_QUALITY}). */
  quality?: number
}

/**
 * Load an image `File`, scale it so its longest edge is ≤ `max` (no upscaling),
 * and export it as an `image/jpeg` data URL. Browser-only (uses `Image` +
 * `<canvas>`); mirrors the legacy `resizeStopPhoto` approach so saved photos
 * stay small enough to live inline in the trip JSON.
 *
 * Rejects: non-image files, HEIC/HEIF (canvas can't decode), inputs over
 * {@link MAX_INPUT_BYTES}, undecodable images, and blank canvas output.
 */
export function resizeToDataUrl(file: File, opts: ResizeOpts = {}): Promise<string> {
  const max = opts.max ?? MAX_EDGE
  const quality = opts.quality ?? JPEG_QUALITY
  return new Promise((resolve, reject) => {
    if (!file || !file.type || !file.type.startsWith('image/')) {
      reject(new Error('That file isn’t an image.'))
      return
    }
    // Canvas can't decode HEIC/HEIF (common straight off an iPhone).
    if (file.type === 'image/heic' || file.type === 'image/heif') {
      reject(new Error('HEIC photos aren’t supported — convert to JPEG first.'))
      return
    }
    if (file.size > MAX_INPUT_BYTES) {
      reject(new Error('That photo is too large — try one under 25 MB.'))
      return
    }

    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      if (!img.naturalWidth || !img.naturalHeight) {
        reject(new Error('That image has no dimensions.'))
        return
      }
      const { w, h } = scaledDims(img.naturalWidth, img.naturalHeight, max)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Couldn’t prepare the image.'))
        return
      }
      ctx.drawImage(img, 0, 0, w, h)
      const dataUrl = canvas.toDataURL('image/jpeg', quality)
      // A real JPEG data URI is comfortably over 1 KB — shorter means a blank canvas.
      if (!dataUrl || dataUrl.length < 1000) {
        reject(new Error('That image couldn’t be processed.'))
        return
      }
      resolve(dataUrl)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Couldn’t read that image.'))
    }
    img.src = url
  })
}

/**
 * The stop's display/cover image: the first user photo if present, else the
 * legacy `stop.image`, else undefined. Set-cover (moving a photo to index 0)
 * therefore changes what shows everywhere this is used. Pure + unit-tested.
 */
export function coverPhoto(stop: Pick<Stop, 'photos' | 'image'>): string | undefined {
  return stop.photos?.[0] ?? stop.image
}

/** Rough byte weight of an array of data URLs (decoded base64 length). */
export function photoBytes(photos: string[] | undefined): number {
  if (!photos?.length) return 0
  return photos.reduce((sum, p) => {
    const comma = p.indexOf(',')
    const b64 = comma >= 0 ? p.length - comma - 1 : p.length
    return sum + Math.floor(b64 * 0.75)
  }, 0)
}
