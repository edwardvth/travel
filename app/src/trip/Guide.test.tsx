import { render, screen } from '@testing-library/react'
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

function tripWith(days: { stops: { name: string }[] }[], completed: string[] = []): Trip {
  return {
    id: 't1',
    owner_id: 'u1',
    title: 'St. Louis Weekend',
    subtitle: null,
    config: { destination: 'St. Louis, Missouri, United States' },
    data: { days: days.map(d => ({ title: '', stops: d.stops })), completed },
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

  it('shows the restrained "day complete" state when every stop is done', () => {
    renderGuide(tripWith([{ stops: [{ name: 'Gateway Arch' }] }], ['0-0']))
    expect(screen.getByText(/complete/i)).toBeInTheDocument()
  })
})
