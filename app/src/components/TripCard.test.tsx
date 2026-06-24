import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { TripCard } from './TripCard'
import type { Trip } from '../types'

// Stub the on-demand destination landmark with a fixed URL so we can assert
// exactly which source the cover resolves to.
vi.mock('../data/useLandmarkImage', () => ({
  useLandmarkImage: () => ({ url: 'https://landmark.example/arch.jpg', loading: false }),
}))

const tripWith = (over: Partial<Trip>): Trip =>
  ({
    id: 't1',
    owner_id: null,
    title: 'St. Louis',
    subtitle: null,
    config: { destination: 'St. Louis, Missouri, United States' },
    data: { completed: [], days: [{ title: 'Day 1', stops: [] }] },
    ...over,
  }) as Trip

const coverSrc = () => (screen.getByAltText('St. Louis') as HTMLImageElement).getAttribute('src')

describe('TripCard cover is the destination, stable as stops change', () => {
  it('ignores an arbitrary stop `.image` and uses the destination landmark when there is no stored cover', () => {
    // Regression: a backfilled stop image used to hijack the thumbnail.
    const trip = tripWith({
      data: { completed: [], days: [{ title: 'D', stops: [{ name: 'Hotel', image: 'https://stop.example/suitcase.jpg' }] }] },
    } as Partial<Trip>)
    render(<TripCard trip={trip} onOpen={() => {}} />)
    expect(coverSrc()).toBe('https://landmark.example/arch.jpg')
  })

  it('uses the stored config.coverImage when present (above the landmark)', () => {
    const trip = tripWith({
      config: { destination: 'St. Louis', coverImage: 'https://stored.example/cover.jpg' },
      data: { completed: [], days: [{ title: 'D', stops: [{ name: 'Hotel', image: 'https://stop.example/suitcase.jpg' }] }] },
    } as Partial<Trip>)
    render(<TripCard trip={trip} onOpen={() => {}} />)
    expect(coverSrc()).toBe('https://stored.example/cover.jpg')
  })
})
