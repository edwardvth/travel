import { describe, it, expect, vi, beforeEach } from 'vitest'

const fetchUnsplashCover = vi.fn()
const fetchFirstLandmarkImage = vi.fn()
vi.mock('./unsplash', () => ({ fetchUnsplashCover: (...a: unknown[]) => fetchUnsplashCover(...a) }))
vi.mock('./landmark', () => ({ fetchFirstLandmarkImage: (...a: unknown[]) => fetchFirstLandmarkImage(...a) }))

import { resolveCoverImage } from './cover-image'

beforeEach(() => {
  fetchUnsplashCover.mockReset()
  fetchFirstLandmarkImage.mockReset()
})

describe('resolveCoverImage', () => {
  it('prefers Unsplash and never calls Wikipedia when Unsplash hits', async () => {
    fetchUnsplashCover.mockResolvedValue('https://images.unsplash.com/a')
    expect(await resolveCoverImage(['Chicago', 'Willis Tower'])).toBe('https://images.unsplash.com/a')
    expect(fetchUnsplashCover).toHaveBeenCalledWith('Chicago')
    expect(fetchFirstLandmarkImage).not.toHaveBeenCalled()
  })

  it('falls back to the Wikipedia list when Unsplash misses', async () => {
    fetchUnsplashCover.mockResolvedValue(null)
    fetchFirstLandmarkImage.mockResolvedValue('https://upload.wikimedia.org/x.jpg')
    expect(await resolveCoverImage(['Chicago', 'Willis Tower'])).toBe('https://upload.wikimedia.org/x.jpg')
    expect(fetchFirstLandmarkImage).toHaveBeenCalledWith(['Chicago', 'Willis Tower'])
  })

  it('returns null when both sources miss', async () => {
    fetchUnsplashCover.mockResolvedValue(null)
    fetchFirstLandmarkImage.mockResolvedValue(null)
    expect(await resolveCoverImage(['Chicago'])).toBeNull()
  })

  it('skips Unsplash for an empty query list', async () => {
    fetchFirstLandmarkImage.mockResolvedValue(null)
    expect(await resolveCoverImage([])).toBeNull()
    expect(fetchUnsplashCover).not.toHaveBeenCalled()
  })
})
