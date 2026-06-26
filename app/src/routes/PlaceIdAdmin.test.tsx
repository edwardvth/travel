import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type React from 'react'

// Mock the admin client, auth, and profile so the screen renders in isolation.
vi.mock('../data/usePlaceIdAdmin', () => ({
  placeIdAdmin: {
    metrics: vi.fn(),
    scan: vi.fn(),
    list: vi.fn(),
    attach: vi.fn(),
    skip: vi.fn(),
    reset: vi.fn(),
  },
}))
vi.mock('../auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('../data/useProfile', () => ({
  useProfile: vi.fn(),
  isFounder: (p: { role?: string } | null | undefined) => p?.role === 'founder',
}))

import PlaceIdAdmin from './PlaceIdAdmin'
import { placeIdAdmin } from '../data/usePlaceIdAdmin'
import { useProfile } from '../data/useProfile'

const asFounder = () => vi.mocked(useProfile).mockReturnValue({ data: { id: 'u1', role: 'founder' } } as never)
const asFree = () => vi.mocked(useProfile).mockReturnValue({ data: { id: 'u1', role: 'free' } } as never)
const wrap = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe('PlaceIdAdmin (founder review screen)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('redirects a non-founder away (no admin UI rendered)', () => {
    asFree()
    wrap(<PlaceIdAdmin />)
    expect(screen.queryByText('PlaceId Backfill')).toBeNull()
  })

  it('renders for a founder and shows the metrics count on demand', async () => {
    asFounder()
    vi.mocked(placeIdAdmin.metrics).mockResolvedValue({ pending_review: 5 })
    wrap(<PlaceIdAdmin />)
    expect(screen.getByText('PlaceId Backfill')).toBeTruthy()
    fireEvent.click(screen.getByText('Refresh metrics'))
    expect(await screen.findByText(/pending review: 5/)).toBeTruthy()
  })

  it('attach sends exactly the frozen candidate the founder picked', async () => {
    asFounder()
    vi.mocked(placeIdAdmin.list).mockResolvedValue({
      rows: [{
        id: 42, trip_id: 't1', owner_id: 'u9', day_index: 0, stop_index: 1,
        stop_name: 'The Arch', stop_lat: null, stop_lng: null, score: 0.55,
        candidates: [{ placeId: 'pX', name: 'Gateway Arch', address: 'St. Louis, MO', types: ['park'], distanceM: 40 }],
        status: 'pending', created_at: '2026-06-24T00:00:00Z',
      }],
    })
    vi.mocked(placeIdAdmin.attach).mockResolvedValue({ status: 'resolved' })
    vi.mocked(placeIdAdmin.metrics).mockResolvedValue({ pending_review: 0 })

    wrap(<PlaceIdAdmin />)
    fireEvent.click(screen.getByText('Load'))
    await screen.findByText('The Arch')
    fireEvent.click(screen.getByText('This one'))

    await waitFor(() => expect(placeIdAdmin.attach).toHaveBeenCalledWith(42, 'pX'))
  })
})
