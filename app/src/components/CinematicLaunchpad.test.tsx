import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { CinematicLaunchpad } from './CinematicLaunchpad'
import type { Trip } from '../types'

vi.mock('../home/FieldGlobe', () => ({ FieldGlobe: (p: { active?: boolean }) => <div data-testid="field-globe" data-active={String(p.active)} /> }))
vi.mock('../data/useLandmarkImage', () => ({ useLandmarkImage: () => ({ url: null, loading: false }) }))

const past: Trip = {
  id: 'ams', owner_id: 'o', title: 'Amsterdam', subtitle: null,
  config: { title: 'Amsterdam', startDate: '2026-01-01', numDays: 3 },
  data: { days: [{ title: 'D', stops: [] }], completed: [], hotel: null },
}

describe('CinematicLaunchpad', () => {
  it('renders the hero headline, the globe, and Your travels', () => {
    render(<CinematicLaunchpad pastTrips={[past]} onCreate={vi.fn()} onOpenTrip={vi.fn()} />)
    expect(screen.getByText('Where to next?')).toBeInTheDocument()
    expect(screen.getByTestId('field-globe')).toBeInTheDocument()
    expect(screen.getByText(/your travels/i)).toBeInTheDocument()
    expect(screen.getByText('Amsterdam')).toBeInTheDocument()
  })
})
