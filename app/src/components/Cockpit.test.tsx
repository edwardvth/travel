import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { Cockpit } from './Cockpit'
import type { Trip, Day } from '../types'

// Cover + weather are external; stub them so tests are deterministic and offline.
vi.mock('../data/useLandmarkImage', () => ({ useLandmarkImage: () => ({ url: null, loading: false }) }))
vi.mock('../trip/useWeather', () => ({ useWeather: () => ({ tempMax: null, tempMin: null, code: null, loading: false }) }))

const day = (stops: number, reserveTo = 0): Day => ({
  title: 'D',
  stops: Array.from({ length: stops }, (_, i) => ({
    name: `s${i}`, ...(i < reserveTo ? { reservation: { status: 'to_reserve' as const } } : {}),
  })),
})
const mk = (cfg: Partial<Trip['config']>, days: Day[]): Trip => ({
  id: 'kyoto', owner_id: 'o', title: 'Kyoto', subtitle: null,
  config: { title: 'Kyoto', ...cfg }, data: { days, completed: [], hotel: null },
})

describe('Cockpit', () => {
  it('shows the trip name and a countdown for a planned future trip', () => {
    render(<Cockpit trip={mk({ startDate: '2026-07-17', numDays: 2 }, [day(2, 1)])} today="2026-07-10" onOpen={() => {}} onOpenArrange={() => {}} />)
    expect(screen.getByText('Kyoto')).toBeInTheDocument()
    expect(screen.getByText('In 7 days')).toBeInTheDocument()
  })

  it('opens the trip when the surface is clicked', async () => {
    const onOpen = vi.fn()
    render(<Cockpit trip={mk({ startDate: '2026-07-17', numDays: 2 }, [day(1)])} today="2026-07-10" onOpen={onOpen} onOpenArrange={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: /open kyoto/i }))
    expect(onOpen).toHaveBeenCalledWith('kyoto')
  })

  it('surfaces a "to arrange" action that deep-links without opening the trip', async () => {
    const onOpen = vi.fn(); const onOpenArrange = vi.fn()
    render(<Cockpit trip={mk({ startDate: '2026-07-17', numDays: 1 }, [day(3, 2)])} today="2026-07-10" onOpen={onOpen} onOpenArrange={onOpenArrange} />)
    await userEvent.click(screen.getByRole('button', { name: /2 to arrange/i }))
    expect(onOpenArrange).toHaveBeenCalledWith('kyoto')
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('shows a "Start planning" nudge and no countdown when the trip is unplanned', () => {
    render(<Cockpit trip={mk({ startDate: '2026-07-17', numDays: 2 }, [day(0)])} today="2026-07-10" onOpen={() => {}} onOpenArrange={() => {}} />)
    expect(screen.getByText(/start planning/i)).toBeInTheDocument()
    expect(screen.queryByText(/to arrange/i)).not.toBeInTheDocument()
  })

  it('renders without a countdown when the trip has no dates', () => {
    render(<Cockpit trip={mk({}, [day(2)])} today="2026-07-10" onOpen={() => {}} onOpenArrange={() => {}} />)
    expect(screen.getByText('Kyoto')).toBeInTheDocument()
    expect(screen.queryByText(/in \d+ days/i)).not.toBeInTheDocument()
  })
})
