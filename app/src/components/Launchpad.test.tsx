import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { Launchpad } from './Launchpad'
import type { Trip } from '../types'

vi.mock('../data/useLandmarkImage', () => ({ useLandmarkImage: () => ({ url: null, loading: false }) }))

const past: Trip = {
  id: 'ams', owner_id: 'o', title: 'Amsterdam', subtitle: null,
  config: { title: 'Amsterdam', startDate: '2026-01-01', numDays: 3 },
  data: { days: [{ title: 'D', stops: [] }], completed: [], hotel: null },
}

describe('Launchpad', () => {
  it('shows the headline and a create affordance', async () => {
    const onCreate = vi.fn()
    render(<Launchpad pastTrips={[]} onCreate={onCreate} onOpenTrip={() => {}} />)
    expect(screen.getByText(/where to next/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /where to next|start|new trip|search/i }))
    expect(onCreate).toHaveBeenCalled()
  })

  it('shows the Plan / Walk / Remember trio for a brand-new user (no past trips)', () => {
    render(<Launchpad pastTrips={[]} onCreate={() => {}} onOpenTrip={() => {}} />)
    expect(screen.getByText('Plan')).toBeInTheDocument()
    expect(screen.getByText('Walk')).toBeInTheDocument()
    expect(screen.getByText('Remember')).toBeInTheDocument()
    expect(screen.queryByText(/past voyages/i)).not.toBeInTheDocument()
  })

  it('shows Past voyages (and hides the trio) when there are past trips', () => {
    render(<Launchpad pastTrips={[past]} onCreate={() => {}} onOpenTrip={() => {}} />)
    expect(screen.getByText(/past voyages/i)).toBeInTheDocument()
    expect(screen.getByText('Amsterdam')).toBeInTheDocument()
    expect(screen.queryByText('Walk')).not.toBeInTheDocument()
  })
})
