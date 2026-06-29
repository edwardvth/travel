import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TravelsList } from './TravelsList'
import type { Trip } from '../types'

// Cover image is external; stub it so tests are deterministic and offline.
vi.mock('../data/useLandmarkImage', () => ({ useLandmarkImage: () => ({ url: null, loading: false }) }))

const TODAY = '2026-06-26'

const trip = (id: string, title: string, startDate: string | undefined, numDays: number, extra: Partial<Trip['config']> = {}): Trip => ({
  id, owner_id: 'o', title, subtitle: null,
  config: { title, startDate, numDays, ...extra },
  data: { days: [], completed: [], hotel: null },
})

// `homeGroups` picks its own focus trip (the soonest dated upcoming) and drops it
// from the groups. We give it an ACTIVE trip to absorb that focus slot, so Paris
// and Tokyo remain in the Upcoming group. featuredId mirrors that focus id (and
// the component additionally drops it defensively).
const FEATURED = trip('active', 'Reykjavik', '2026-06-25', 3) // 06-25..06-27 contains today
const FEATURED_ID = 'active'

function renderList(trips: Trip[], onOpen = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <TravelsList trips={trips} featuredId={FEATURED_ID} onOpen={onOpen} userId={undefined} today={TODAY} />
    </QueryClientProvider>,
  )
  return onOpen
}

// All dated: at least one upcoming + one past, NO undated (so no "Planning").
const PARIS = trip('paris', 'Paris', '2026-07-01', 2)        // upcoming
const TOKYO = trip('tokyo', 'Tokyo', '2026-08-01', 2)        // upcoming (later)
const ROME = trip('rome', 'Rome', '2026-05-01', 2)           // past

describe('TravelsList', () => {
  it('renders Upcoming and Past headings but not Planning (none undated)', () => {
    renderList([FEATURED, PARIS, TOKYO, ROME])
    expect(screen.getByRole('heading', { name: 'Upcoming' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Past' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Planning' })).not.toBeInTheDocument()
  })

  it('filters by search query and restores via the clear button', async () => {
    renderList([FEATURED, PARIS, TOKYO, ROME])
    expect(screen.getByText('Paris')).toBeInTheDocument()
    expect(screen.getByText('Tokyo')).toBeInTheDocument()

    const input = screen.getByRole('searchbox')
    await userEvent.type(input, 'paris')
    expect(screen.getByText('Paris')).toBeInTheDocument()
    expect(screen.queryByText('Tokyo')).not.toBeInTheDocument()
    expect(screen.queryByText('Rome')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Clear trip search' }))
    expect(screen.getByText('Tokyo')).toBeInTheDocument()
    expect(screen.getByText('Rome')).toBeInTheDocument()
  })

  it('clears the query when Escape is pressed in the search input', async () => {
    renderList([FEATURED, PARIS, TOKYO, ROME])
    const input = screen.getByRole('searchbox')
    await userEvent.type(input, 'paris')
    expect(screen.queryByText('Tokyo')).not.toBeInTheDocument()
    await userEvent.type(input, '{Escape}')
    expect(screen.getByText('Tokyo')).toBeInTheDocument()
  })

  it('switches to the Detailed view when the Detailed toggle is clicked', async () => {
    renderList([FEATURED, PARIS, TOKYO, ROME])
    // Tiles is the default: no "When" column header yet.
    expect(screen.queryByText('When')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /detailed/i }))
    // Detailed-only marker: the column header row appears (on md+).
    // The view crossfades (AnimatePresence mode="wait"), so await it.
    expect((await screen.findAllByText('When')).length).toBeGreaterThan(0)
  })

  it('shows an empty state when nothing matches', async () => {
    renderList([FEATURED, PARIS, TOKYO, ROME])
    await userEvent.type(screen.getByRole('searchbox'), 'zzzznotrip')
    expect(screen.getByText(/no trips match/i)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Upcoming' })).not.toBeInTheDocument()
  })

  it('groups trips under their section (Paris + Tokyo upcoming, Rome past)', () => {
    renderList([FEATURED, PARIS, TOKYO, ROME])
    const upcoming = screen.getByRole('heading', { name: 'Upcoming' }).closest('section')!
    const past = screen.getByRole('heading', { name: 'Past' }).closest('section')!
    expect(within(upcoming).getByText('Paris')).toBeInTheDocument()
    expect(within(upcoming).getByText('Tokyo')).toBeInTheDocument()
    expect(within(past).getByText('Rome')).toBeInTheDocument()
  })
})

