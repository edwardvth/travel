import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { CockpitCard } from './CockpitCard'
import type { Trip, Day } from '../types'

// Cover + weather are external; stub them so tests are deterministic and offline.
vi.mock('../data/useLandmarkImage', () => ({ useLandmarkImage: () => ({ url: null, loading: false }) }))
vi.mock('../trip/useWeather', () => ({ useWeather: () => ({ tempMax: null, tempMin: null, code: null, loading: false }) }))

const baseTrip = (over: Partial<Trip['config']>, days: Day[] = [{ title: 'D', stops: [{ name: 's' }] }] as Day[]): Trip =>
  ({ id: 't1', title: 'Tokyo', config: { startDate: '2026-07-01', numDays: 1, ...over }, data: { days, completed: [] } } as unknown as Trip)

const noop = () => {}

describe('CockpitCard', () => {
  it('before+incomplete: "Start planning" calls onOpen; the card body/title is NOT a button', () => {
    const onOpen = vi.fn()
    render(
      <CockpitCard trip={baseTrip({}, [{ title: 'D', stops: [] }] as Day[])} onOpen={onOpen} onOpenArrange={noop} onOpenGuide={noop} units="metric" today="2026-06-01" />,
    )
    fireEvent.click(screen.getByRole('button', { name: /start planning/i }))
    expect(onOpen).toHaveBeenCalledWith('t1')
    expect(screen.getByText('Tokyo').closest('button')).toBeNull()
  })

  it('before+complete: "Open plan" calls onOpen', () => {
    const onOpen = vi.fn()
    render(
      <CockpitCard trip={baseTrip({})} onOpen={onOpen} onOpenArrange={noop} onOpenGuide={noop} units="metric" today="2026-06-01" />,
    )
    fireEvent.click(screen.getByRole('button', { name: /open plan/i }))
    expect(onOpen).toHaveBeenCalledWith('t1')
  })

  it('during: "Start guide" calls onOpenGuide', () => {
    const onOpenGuide = vi.fn()
    render(
      <CockpitCard trip={baseTrip({ startDate: '2026-06-01', numDays: 1 })} onOpen={noop} onOpenArrange={noop} onOpenGuide={onOpenGuide} units="metric" today="2026-06-01" />,
    )
    fireEvent.click(screen.getByRole('button', { name: /start guide/i }))
    expect(onOpenGuide).toHaveBeenCalledWith('t1')
  })

  it('undated trip shows "Planning travel" countdown', () => {
    render(
      <CockpitCard trip={baseTrip({ startDate: undefined })} onOpen={noop} onOpenArrange={noop} onOpenGuide={noop} units="metric" today="2026-06-01" />,
    )
    expect(screen.getByText('Planning travel')).toBeInTheDocument()
  })

  it('shows a "N to arrange" deep-link that fires onOpenArrange without onOpen', () => {
    const onOpen = vi.fn()
    const onOpenArrange = vi.fn()
    const days = [{ title: 'D', stops: [{ name: 'a', reservation: { status: 'to_reserve' } }, { name: 'b', reservation: { status: 'to_reserve' } }] }] as unknown as Day[]
    render(
      <CockpitCard trip={baseTrip({}, days)} onOpen={onOpen} onOpenArrange={onOpenArrange} onOpenGuide={noop} units="metric" today="2026-06-01" />,
    )
    fireEvent.click(screen.getByRole('button', { name: /2 to arrange/i }))
    expect(onOpenArrange).toHaveBeenCalledWith('t1')
    expect(onOpen).not.toHaveBeenCalled()
  })
})
