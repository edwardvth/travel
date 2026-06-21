import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMemoryRouter, RouterProvider, Outlet } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Guide from './Guide'
import type { PlannerOutletContext } from './PlannerLayout'
import type { Trip } from '../types'

// Mock auth + settings so Guide never reaches AuthProvider / Supabase in tests.
vi.mock('../auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('../data/useAccountSettings', () => ({
  useAccountSettings: () => ({ settings: {}, setSettings: () => {} }),
}))

/** Render Guide inside a real outlet carrying a controlled planner context. */
function renderGuide(trip: Trip, ctx: Partial<PlannerOutletContext> = {}) {
  const context: PlannerOutletContext = {
    trip,
    canEdit: true,
    save: vi.fn(),
    saving: false,
    lastSavedAt: null,
    saveError: null,
    activeDay: 0,
    setActiveDay: vi.fn(),
    ...ctx,
  }
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [{ path: '/', element: <Outlet context={context} />, children: [{ index: true, element: <Guide /> }] }],
    { initialEntries: ['/'] },
  )
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

function tripWith(days: { stops: { name: string; history?: string }[] }[], completed: string[] = []): Trip {
  return {
    id: 't1',
    owner_id: 'u1',
    title: 'St. Louis Weekend',
    subtitle: null,
    config: { destination: 'St. Louis, Missouri, United States' },
    // Default `history` so the focused card renders its body (not the enrichment
    // skeleton) — enrichment-on-demand is exercised elsewhere.
    data: {
      days: days.map(d => ({ title: '', stops: d.stops.map(s => ({ history: 'x', ...s })) })),
      completed,
    },
  } as unknown as Trip
}

describe('Guide orchestrator', () => {
  beforeEach(() => {
    // No geolocation → degrade gracefully (no live chip, no auto-arrival).
    vi.stubGlobal('navigator', { userAgent: 'test', geolocation: undefined })
  })

  it('shows the editorial empty state for a day with no stops', () => {
    renderGuide(tripWith([{ stops: [] }]))
    expect(screen.getByText(/No stops on this day yet/i)).toBeInTheDocument()
  })

  it('shows the restrained "day complete" note when every stop is done', () => {
    renderGuide(tripWith([{ stops: [{ name: 'Gateway Arch' }] }], ['0-0']))
    // The day-complete note still surfaces, and the completed stop stays
    // reopenable in the list below it (never a forward-only dead end).
    expect(screen.getByText(/every stop on this day is done/i)).toBeInTheDocument()
    // The completed stop stays surfaced — the section force-opens its card (and
    // also previews the name), so it appears at least once.
    expect(screen.getAllByText('Gateway Arch').length).toBeGreaterThan(0)
  })

  it('renders the active + upcoming stops, with completed ones behind the section', async () => {
    const user = userEvent.setup()
    renderGuide(
      tripWith([{ stops: [{ name: 'Arch' }, { name: 'Museum' }, { name: 'Park' }] }], ['0-0']),
    )
    // Current + upcoming are always visible; the completed Arch lives in the
    // collapsed-by-default Completed Stops section above them (no open row yet).
    expect(screen.getByText('Museum')).toBeInTheDocument()
    expect(screen.getByText('Park')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Open Arch/i })).toBeNull()
    // Expanding the section reveals the completed stop as a reopenable row.
    await user.click(screen.getByRole('button', { name: /1 Stop Complete/i }))
    expect(screen.getByRole('button', { name: /Open Arch/i })).toBeInTheDocument()
  })

  it('un-completes a stop through the edit-gated save path', async () => {
    const user = userEvent.setup()
    const save = vi.fn()
    renderGuide(tripWith([{ stops: [{ name: 'Arch' }, { name: 'Museum' }] }], ['0-0']), { save })
    // Arch is a completed stop; expand the Completed Stops section, then its ✓
    // un-marks it.
    await user.click(screen.getByRole('button', { name: /1 Stop Complete/i }))
    await user.click(screen.getByRole('button', { name: /Mark Arch not complete/i }))
    expect(save).toHaveBeenCalledTimes(1)
    const arg = save.mock.calls[0][0]
    expect(arg.data.completed).toEqual([]) // toggled off
  })

  it('lets the traveller focus an upcoming stop and expand it', async () => {
    const user = userEvent.setup()
    renderGuide(tripWith([{ stops: [{ name: 'Arch' }, { name: 'Museum' }] }], []))
    // Museum starts as a collapsed upcoming row; tapping opens it (expanded card
    // shows the Directions action).
    await user.click(screen.getByRole('button', { name: /Open Museum/i }))
    expect(screen.getByRole('button', { name: /Mark Museum complete/i })).toBeInTheDocument()
  })

  it('does not surface (un)complete controls for view-only users', () => {
    renderGuide(tripWith([{ stops: [{ name: 'Arch' }, { name: 'Museum' }] }], ['0-0']), {
      canEdit: false,
    })
    // The completed Arch row shows a plain ✓ marker, not an un-complete button.
    expect(screen.queryByRole('button', { name: /Mark Arch not complete/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /Mark .* complete/i })).toBeNull()
  })
})
