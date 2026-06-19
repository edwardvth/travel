import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom'
import TripMap from './TripMap'
import type { Trip } from '../types'
import type { PlannerOutletContext } from './PlannerLayout'

// jsdom can't render Leaflet (no layout engine), and TripMap feature-detects
// that and skips map init. These tests only assert the React chrome renders:
// the day selector and the no-stops overlay — without throwing.

function renderWithTrip(trip: Trip) {
  const ctx: PlannerOutletContext = {
    trip,
    canEdit: false,
    save: () => {},
    saving: false,
    lastSavedAt: null,
    saveError: null,
  }
  return render(
    <MemoryRouter>
      <Routes>
        <Route element={<Outlet context={ctx} />}>
          <Route path="*" element={<TripMap />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

function makeTrip(partial?: Partial<Trip>): Trip {
  return {
    id: 't1',
    owner_id: null,
    title: 'Paris',
    subtitle: null,
    config: { dayLabels: ['Day 1', 'Day 2'] },
    data: { days: [{ title: 'Day 1', stops: [] }, { title: 'Day 2', stops: [] }], completed: [], hotel: null },
    ...partial,
  }
}

describe('TripMap', () => {
  it('renders the day selector with All days + a chip per day', () => {
    renderWithTrip(makeTrip())
    expect(screen.getByRole('tab', { name: /all days/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /day 1/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /day 2/i })).toBeInTheDocument()
  })

  it('shows the no-stops overlay when nothing is geocoded', () => {
    renderWithTrip(makeTrip())
    expect(screen.getByText(/no mapped stops yet/i)).toBeInTheDocument()
  })

  it('does not throw with stops that have coordinates', () => {
    const trip = makeTrip({
      data: {
        days: [{ title: 'Day 1', stops: [{ name: 'Louvre', lat: 48.86, lng: 2.33 }] }],
        completed: [],
        hotel: null,
      },
      config: { dayLabels: ['Day 1'] },
    })
    expect(() => renderWithTrip(trip)).not.toThrow()
  })
})
