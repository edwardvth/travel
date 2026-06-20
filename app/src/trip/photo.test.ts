import { describe, it, expect } from 'vitest'
import { scaledDims, coverPhoto, coverPreview, photoBytes, MAX_EDGE } from './photo'

describe('scaledDims', () => {
  it('clamps the longest edge to max (landscape)', () => {
    const d = scaledDims(2400, 1200, 1200)
    expect(d.w).toBe(1200)
    expect(d.h).toBe(600)
  })

  it('clamps the longest edge to max (portrait)', () => {
    const d = scaledDims(1000, 4000, 1200)
    expect(d.h).toBe(1200)
    expect(d.w).toBe(300)
  })

  it('preserves aspect ratio within a pixel', () => {
    const w = 3000, h = 2000
    const d = scaledDims(w, h, 1200)
    expect(d.w).toBe(1200)
    // 1200 * (2000/3000) = 800
    expect(d.h).toBe(800)
    expect(Math.abs(d.w / d.h - w / h)).toBeLessThan(0.01)
  })

  it('never upscales when already within max', () => {
    const d = scaledDims(800, 600, 1200)
    expect(d).toEqual({ w: 800, h: 600 })
  })

  it('leaves an exactly-max image untouched', () => {
    const d = scaledDims(1200, 900, 1200)
    expect(d).toEqual({ w: 1200, h: 900 })
  })

  it('defaults max to MAX_EDGE (1200)', () => {
    expect(scaledDims(2400, 2400).w).toBe(MAX_EDGE)
  })

  it('floors degenerate dimensions to 1×1', () => {
    expect(scaledDims(0, 0)).toEqual({ w: 1, h: 1 })
    expect(scaledDims(-5, 100)).toEqual({ w: 1, h: 1 })
  })

  it('keeps a tiny scaled edge at least 1px', () => {
    const d = scaledDims(10000, 1, 1200)
    expect(d.w).toBe(1200)
    expect(d.h).toBe(1)
  })
})

describe('coverPhoto', () => {
  it('returns the first photo when photos exist', () => {
    expect(coverPhoto({ photos: ['a', 'b'], image: 'legacy' })).toBe('a')
  })

  it('falls back to stop.image when there are no photos', () => {
    expect(coverPhoto({ image: 'legacy' })).toBe('legacy')
    expect(coverPhoto({ photos: [], image: 'legacy' })).toBe('legacy')
  })

  it('returns undefined when neither photos nor image exist', () => {
    expect(coverPhoto({})).toBeUndefined()
    expect(coverPhoto({ photos: [] })).toBeUndefined()
  })
})

describe('coverPreview', () => {
  it('prefers a stored config.coverImage', () => {
    const trip = {
      config: { coverImage: 'manual' },
      data: { days: [{ stops: [{ image: 'stop' }] }] },
    }
    expect(coverPreview(trip)).toBe('manual')
  })

  it('falls back to the first stop image when no coverImage', () => {
    const trip = {
      config: {},
      data: { days: [{ stops: [{}, { image: 'stop' }] }] },
    }
    expect(coverPreview(trip)).toBe('stop')
  })

  it('scans across days for the first stop image', () => {
    const trip = {
      data: { days: [{ stops: [{}] }, { stops: [{ image: 'second-day' }] }] },
    }
    expect(coverPreview(trip)).toBe('second-day')
  })

  it('returns undefined when nothing synchronous resolves', () => {
    expect(coverPreview({})).toBeUndefined()
    expect(coverPreview({ config: {}, data: { days: [] } })).toBeUndefined()
    expect(coverPreview({ data: { days: [{ stops: [{}] }] } })).toBeUndefined()
  })
})

describe('photoBytes', () => {
  it('is 0 for no photos', () => {
    expect(photoBytes(undefined)).toBe(0)
    expect(photoBytes([])).toBe(0)
  })

  it('approximates decoded base64 weight', () => {
    // 1000 base64 chars after the comma ≈ 750 bytes.
    const url = 'data:image/jpeg;base64,' + 'A'.repeat(1000)
    expect(photoBytes([url])).toBe(750)
  })
})
