import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { Trip } from '../types'
import type { DestinationVideo } from './destinationVideo'
import { useDestinationClip } from './useDestinationClip'
import { FIRST_CLIP, curatedClipFor } from './wordClips'

vi.mock('./destinationVideo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./destinationVideo')>()
  return { ...actual, fetchDestinationVideo: vi.fn() }
})

import { fetchDestinationVideo } from './destinationVideo'

const mockFetch = vi.mocked(fetchDestinationVideo)

function tripFor(destination: string): Trip {
  return { id: 't', title: 'T', config: { destination } } as unknown as Trip
}

const PEXELS_VIDEO: DestinationVideo = {
  url: 'https://pexels.example/v.mp4',
  poster: 'https://pexels.example/v.jpg',
  credit: { pexelsUrl: 'https://pexels.com/p', name: 'A Photographer', url: 'https://pexels.com/u' },
}

beforeEach(() => {
  mockFetch.mockReset()
})

describe('useDestinationClip', () => {
  it('returns the curated clip immediately for a curated destination and does not fetch', () => {
    const curated = curatedClipFor('Tokyo')
    expect(curated).not.toBeNull()

    const { result } = renderHook(() => useDestinationClip(tripFor('Tokyo')))

    expect(result.current.clip.id).toBe(curated!.id)
    expect(result.current.credit).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('matches the leading city token so "Tokyo, Japan" still uses the curated clip (no fetch)', () => {
    const curated = curatedClipFor('Tokyo')
    const { result } = renderHook(() => useDestinationClip(tripFor('Tokyo, Japan')))
    expect(result.current.clip.id).toBe(curated!.id)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('starts on FIRST_CLIP then swaps to the Pexels clip for an uncurated destination', async () => {
    mockFetch.mockResolvedValue(PEXELS_VIDEO)

    const { result } = renderHook(() => useDestinationClip(tripFor('Sochi')))

    // Immediate clip is the girl-walking fallback (no blank, no flash).
    expect(result.current.clip.id).toBe(FIRST_CLIP.id)
    expect(FIRST_CLIP.id).toBe('girl-walking')

    await waitFor(() => {
      expect(result.current.clip.sources[0]?.src).toBe(PEXELS_VIDEO.url)
    })
    expect(result.current.clip.id).toBe('pexels-Sochi')
    expect(result.current.credit).toEqual(PEXELS_VIDEO.credit)
    expect(mockFetch).toHaveBeenCalledWith('Sochi')
  })

  it('stays on FIRST_CLIP when Pexels misses (resolves null)', async () => {
    mockFetch.mockResolvedValue(null)

    const { result } = renderHook(() => useDestinationClip(tripFor('Sochi')))

    expect(result.current.clip.id).toBe(FIRST_CLIP.id)

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled()
    })
    expect(result.current.clip.id).toBe(FIRST_CLIP.id)
    expect(result.current.credit).toBeNull()
  })
})
