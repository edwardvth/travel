import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { Launchpad } from './Launchpad'
import type { Trip } from '../types'

vi.mock('../home/FieldGlobe', () => ({ FieldGlobe: () => <div data-testid="field-globe" /> }))
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
    await userEvent.click(screen.getByRole('button', { name: /new trip/i }))
    expect(onCreate).toHaveBeenCalled()
  })

  it('shows the Your travels section for a brand-new user (no past trips)', () => {
    render(<Launchpad pastTrips={[]} onCreate={() => {}} onOpenTrip={() => {}} />)
    expect(screen.getByText(/your travels/i)).toBeInTheDocument()
    expect(screen.queryByText('Amsterdam')).not.toBeInTheDocument()
  })

  it('shows Your travels with past trips when there are past trips', () => {
    render(<Launchpad pastTrips={[past]} onCreate={() => {}} onOpenTrip={() => {}} />)
    expect(screen.getByText(/your travels/i)).toBeInTheDocument()
    expect(screen.getByText('Amsterdam')).toBeInTheDocument()
  })
})
