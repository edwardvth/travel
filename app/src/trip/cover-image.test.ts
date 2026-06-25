import { describe, it, expect, vi, beforeEach } from 'vitest'

const fetchUnsplashCover = vi.fn()
const fetchFirstLandmarkThumb = vi.fn()
vi.mock('./unsplash', () => ({ fetchUnsplashCover: (...a: unknown[]) => fetchUnsplashCover(...a) }))
vi.mock('./landmark', () => ({ fetchFirstLandmarkThumb: (...a: unknown[]) => fetchFirstLandmarkThumb(...a) }))

import { resolveCoverImage, unsplashQuery } from './cover-image'

beforeEach(() => {
  fetchUnsplashCover.mockReset()
  fetchFirstLandmarkThumb.mockReset()
})

describe('unsplashQuery', () => {
  it('reduces a verbose destination to just the leading city segment', () => {
    expect(unsplashQuery('St. Louis, Missouri, United States')).toBe('St. Louis')
    expect(unsplashQuery('Chicago, Illinois')).toBe('Chicago')
  })
  it('leaves an already-clean city name alone', () => {
    expect(unsplashQuery('Paris')).toBe('Paris')
    expect(unsplashQuery('  Kyoto  ')).toBe('Kyoto')
  })
})

describe('resolveCoverImage', () => {
  it('prefers Unsplash queried by the clean city name; never calls Wikipedia when it hits', async () => {
    fetchUnsplashCover.mockResolvedValue('https://images.unsplash.com/a')
    expect(await resolveCoverImage(['St. Louis, Missouri, United States', 'Gateway Arch'])).toEqual({
      url: 'https://images.unsplash.com/a', source: 'unsplash',
    })
    expect(fetchUnsplashCover).toHaveBeenCalledWith('St. Louis')
    expect(fetchFirstLandmarkThumb).not.toHaveBeenCalled()
  })

  it('falls back to Wikipedia (full query list) when Unsplash misses', async () => {
    fetchUnsplashCover.mockResolvedValue(null)
    fetchFirstLandmarkThumb.mockResolvedValue({ url: 'https://upload.wikimedia.org/x.jpg', width: 1600 })
    expect(await resolveCoverImage(['Obscureville, Nowhere'])).toEqual({
      url: 'https://upload.wikimedia.org/x.jpg', source: 'wiki',
    })
    expect(fetchFirstLandmarkThumb).toHaveBeenCalledWith(['Obscureville, Nowhere'])
  })

  it('returns null when both sources miss', async () => {
    fetchUnsplashCover.mockResolvedValue(null)
    fetchFirstLandmarkThumb.mockResolvedValue(null)
    expect(await resolveCoverImage(['Nowhere'])).toBeNull()
  })
})
