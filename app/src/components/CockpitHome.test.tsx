import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi } from 'vitest'
import { CockpitHome } from './CockpitHome'
import type { Trip, Day } from '../types'

// Cover + weather are external; stub them so the hero card renders deterministically
// offline (mirrors Cockpit.test.tsx). FieldGlobe / HeroVideoStage are jsdom-safe.
vi.mock('../data/useLandmarkImage', () => ({ useLandmarkImage: () => ({ url: null, loading: false }) }))
vi.mock('../trip/useWeather', () => ({ useWeather: () => ({ tempMax: null, tempMin: null, code: null, loading: false }) }))

const day = (stops: number): Day => ({
  title: 'D',
  stops: Array.from({ length: stops }, (_, i) => ({ name: `s${i}` })),
})
const mk = (id: string, title: string, cfg: Partial<Trip['config']>, days: Day[]): Trip => ({
  id, owner_id: 'o', title, subtitle: null,
  config: { title, ...cfg }, data: { days, completed: [], hotel: null },
})
const noop = () => {}

function renderHome(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

describe('CockpitHome', () => {
  const today = '2026-07-10'
  // Tokyo is the focus (active/soonest); Lisbon is a separate upcoming trip.
  const tokyo = mk('tokyo', 'Tokyo', { startDate: '2026-07-17', numDays: 2 }, [day(2), day(1)])
  const lisbon = mk('lisbon', 'Lisbon', { startDate: '2026-09-01', numDays: 3 }, [day(1), day(1), day(1)])
  const trips = [tokyo, lisbon]

  it('renders the personalised welcome headline', () => {
    renderHome(
      <CockpitHome trips={trips} focus={tokyo} firstName="Edward" units="metric" today={today}
        onCreate={noop} onOpen={noop} onOpenArrange={noop} onOpenGuide={noop}
        headerRight={<button>New trip</button>} />,
    )
    expect(screen.getByText('Welcome back, Edward.')).toBeInTheDocument()
  })

  it('shows the focus trip in the hero exactly once (not duplicated into the list)', () => {
    renderHome(
      <CockpitHome trips={trips} focus={tokyo} firstName="Edward" units="metric" today={today}
        onCreate={noop} onOpen={noop} onOpenArrange={noop} onOpenGuide={noop}
        headerRight={<button>New trip</button>} />,
    )
    expect(screen.getAllByText('Tokyo')).toHaveLength(1)
    // The other trip still appears in the travels list.
    expect(screen.getByText('Lisbon')).toBeInTheDocument()
  })

  it('renders the supplied headerRight content', () => {
    renderHome(
      <CockpitHome trips={trips} focus={tokyo} firstName="Edward" units="metric" today={today}
        onCreate={noop} onOpen={noop} onOpenArrange={noop} onOpenGuide={noop}
        headerRight={<button>New trip</button>} />,
    )
    expect(screen.getByRole('button', { name: 'New trip' })).toBeInTheDocument()
  })
})
