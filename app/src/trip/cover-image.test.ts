import { describe, it, expect, vi, beforeEach } from 'vitest'

const fetchUnsplashCover = vi.fn()
const fetchFirstLandmarkThumb = vi.fn()
vi.mock('./unsplash', () => ({ fetchUnsplashCover: (...a: unknown[]) => fetchUnsplashCover(...a) }))
vi.mock('./landmark', () => ({ fetchFirstLandmarkThumb: (...a: unknown[]) => fetchFirstLandmarkThumb(...a) }))

import { resolveCoverImage } from './cover-image'

beforeEach(() => {
  fetchUnsplashCover.mockReset()
  fetchFirstLandmarkThumb.mockReset()
})

describe('resolveCoverImage', () => {
  it('prefers a good-resolution Wikipedia image and never calls Unsplash', async () => {
    fetchFirstLandmarkThumb.mockResolvedValue({ url: 'https://upload.wikimedia.org/arch.jpg', width: 1600 })
    expect(await resolveCoverImage(['St. Louis', 'Gateway Arch'])).toEqual({
      url: 'https://upload.wikimedia.org/arch.jpg', source: 'wiki',
    })
    expect(fetchUnsplashCover).not.toHaveBeenCalled()
  })

  it('falls back to Unsplash when the Wikipedia image is too small', async () => {
    fetchFirstLandmarkThumb.mockResolvedValue({ url: 'https://upload.wikimedia.org/tiny.jpg', width: 320 })
    fetchUnsplashCover.mockResolvedValue('https://images.unsplash.com/a')
    expect(await resolveCoverImage(['Smalltown'])).toEqual({ url: 'https://images.unsplash.com/a', source: 'unsplash' })
    expect(fetchUnsplashCover).toHaveBeenCalledWith('Smalltown')
  })

  it('falls back to Unsplash when Wikipedia has no image', async () => {
    fetchFirstLandmarkThumb.mockResolvedValue(null)
    fetchUnsplashCover.mockResolvedValue('https://images.unsplash.com/b')
    expect(await resolveCoverImage(['Nowhere'])).toEqual({ url: 'https://images.unsplash.com/b', source: 'unsplash' })
  })

  it('uses a small Wikipedia image as a last resort when Unsplash also misses', async () => {
    fetchFirstLandmarkThumb.mockResolvedValue({ url: 'https://upload.wikimedia.org/tiny.jpg', width: 320 })
    fetchUnsplashCover.mockResolvedValue(null)
    expect(await resolveCoverImage(['Smalltown'])).toEqual({ url: 'https://upload.wikimedia.org/tiny.jpg', source: 'wiki' })
  })

  it('returns null when both sources miss entirely', async () => {
    fetchFirstLandmarkThumb.mockResolvedValue(null)
    fetchUnsplashCover.mockResolvedValue(null)
    expect(await resolveCoverImage(['Nowhere'])).toBeNull()
  })
})
