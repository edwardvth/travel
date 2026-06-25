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
const noop = () => {}

describe('Cockpit', () => {
  it('shows the trip name and a countdown for a planned future trip', () => {
    render(<Cockpit trip={mk({ startDate: '2026-07-17', numDays: 2 }, [day(2, 1), day(1)])} today="2026-07-10" onOpen={noop} onOpenArrange={noop} onOpenGuide={noop} />)
    expect(screen.getByText('Kyoto')).toBeInTheDocument()
    expect(screen.getByText('In 7 days')).toBeInTheDocument()
  })

  it('opens the trip when the surface is clicked', async () => {
    const onOpen = vi.fn()
    render(<Cockpit trip={mk({ startDate: '2026-07-17', numDays: 2 }, [day(1), day(1)])} today="2026-07-10" onOpen={onOpen} onOpenArrange={noop} onOpenGuide={noop} />)
    await userEvent.click(screen.getByRole('button', { name: /open kyoto/i }))
    expect(onOpen).toHaveBeenCalledWith('kyoto')
  })

  it('surfaces a "to arrange" action that deep-links without opening the trip', async () => {
    const onOpen = vi.fn(); const onOpenArrange = vi.fn()
    render(<Cockpit trip={mk({ startDate: '2026-07-17', numDays: 1 }, [day(3, 2)])} today="2026-07-10" onOpen={onOpen} onOpenArrange={onOpenArrange} onOpenGuide={noop} />)
    await userEvent.click(screen.getByRole('button', { name: /2 to arrange/i }))
    expect(onOpenArrange).toHaveBeenCalledWith('kyoto')
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('shows "Start planning" for an upcoming trip with an unfinished itinerary (→ Plan)', async () => {
    const onOpen = vi.fn()
    // day 2 is empty → itinerary incomplete
    render(<Cockpit trip={mk({ startDate: '2026-07-17', numDays: 2 }, [day(1), day(0)])} today="2026-07-10" onOpen={onOpen} onOpenArrange={noop} onOpenGuide={noop} />)
    await userEvent.click(screen.getByRole('button', { name: /start planning/i }))
    expect(onOpen).toHaveBeenCalledWith('kyoto')
    expect(screen.queryByText(/start guide/i)).not.toBeInTheDocument()
  })

  it('hides both buttons when an upcoming itinerary is fully planned', () => {
    render(<Cockpit trip={mk({ startDate: '2026-07-17', numDays: 2 }, [day(1), day(2)])} today="2026-07-10" onOpen={noop} onOpenArrange={noop} onOpenGuide={noop} />)
    expect(screen.queryByText(/start planning/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/start guide/i)).not.toBeInTheDocument()
  })

  it('shows "Start guide" while the trip is active and deep-links to the guide', async () => {
    const onOpenGuide = vi.fn()
    render(<Cockpit trip={mk({ startDate: '2026-07-08', numDays: 5 }, [day(1), day(1), day(1), day(1), day(1)])} today="2026-07-10" onOpen={noop} onOpenArrange={noop} onOpenGuide={onOpenGuide} />)
    await userEvent.click(screen.getByRole('button', { name: /start guide/i }))
    expect(onOpenGuide).toHaveBeenCalledWith('kyoto')
  })

  it('renders without a countdown when the trip has no dates', () => {
    render(<Cockpit trip={mk({}, [day(2)])} today="2026-07-10" onOpen={noop} onOpenArrange={noop} onOpenGuide={noop} />)
    expect(screen.getByText('Kyoto')).toBeInTheDocument()
    expect(screen.queryByText(/in \d+ days/i)).not.toBeInTheDocument()
  })
})
