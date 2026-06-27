import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TravelTile } from './TravelTile'
import type { Trip, Day } from '../types'

// Cover image is external; stub it so tests are deterministic and offline.
vi.mock('../data/useLandmarkImage', () => ({ useLandmarkImage: () => ({ url: null, loading: false }) }))

const day = (stops: number): Day => ({
  title: 'D',
  stops: Array.from({ length: stops }, (_, i) => ({ name: `s${i}` })),
})
const mk = (cfg: Partial<Trip['config']>, days: Day[]): Trip => ({
  id: 'kyoto', owner_id: 'o', title: 'Kyoto', subtitle: null,
  config: { title: 'Kyoto', ...cfg }, data: { days, completed: [], hotel: null },
})

function renderTile(trip: Trip, onOpen = vi.fn(), today = '2026-07-10') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <TravelTile trip={trip} onOpen={onOpen} today={today} />
    </QueryClientProvider>,
  )
  return onOpen
}

describe('TravelTile', () => {
  it('renders a countdown chip for an upcoming trip', () => {
    renderTile(mk({ startDate: '2026-07-17', numDays: 2 }, [day(2), day(1)]))
    expect(screen.getByText('Kyoto')).toBeInTheDocument()
    expect(screen.getByText(/in \d+ days|tomorrow|upcoming/i)).toBeInTheDocument()
  })

  it('calls onOpen with the trip id when the tile is clicked', async () => {
    const onOpen = renderTile(mk({ startDate: '2026-07-17', numDays: 2 }, [day(1), day(1)]))
    await userEvent.click(screen.getByRole('button', { name: /kyoto/i }))
    expect(onOpen).toHaveBeenCalledWith('kyoto')
  })

  it('does not render an upcoming countdown chip for a past trip', () => {
    renderTile(mk({ startDate: '2026-06-01', numDays: 2 }, [day(1), day(1)]))
    expect(screen.queryByText(/in \d+ days|tomorrow/i)).not.toBeInTheDocument()
  })
})
