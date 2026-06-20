import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { splitTrips, useCreateTrip } from './useTrips'
import type { Trip } from '../types'

// Mock the supabase client; `rpc` resolves to { data, error } like the real SDK.
const rpc = vi.fn()
vi.mock('../lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}))

const t = (id: string, startDate?: string, numDays = 1): Trip => ({
  id, owner_id: 'o', title: id, subtitle: null,
  config: { startDate, numDays }, data: { days: [], completed: [], hotel: null },
})

describe('splitTrips', () => {
  it('separates past from upcoming and keeps undated as upcoming', () => {
    const { upcoming, past } = splitTrips([
      t('old', '2000-01-01'), t('soon', '2999-01-01'), t('undated'),
    ])
    expect(past.map(x => x.id)).toEqual(['old'])
    expect(upcoming.map(x => x.id).sort()).toEqual(['soon', 'undated'])
  })
})

function wrapper(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

describe('useCreateTrip slug collision retry', () => {
  beforeEach(() => { rpc.mockReset() })

  it('derives the id from the title and retries with a suffix on slug_taken', async () => {
    // First insert collides; second (suffixed) succeeds.
    rpc
      .mockResolvedValueOnce({ data: { ok: false, reason: 'slug_taken' }, error: null })
      .mockResolvedValueOnce({ data: { ok: true }, error: null })

    const qc = new QueryClient()
    const { result } = renderHook(() => useCreateTrip(), { wrapper: wrapper(qc) })

    let id = ''
    await act(async () => {
      id = await result.current.mutateAsync({ slug: '', title: 'Kyoto Spring 2026', subtitle: '', start: '', end: '' })
    })

    expect(rpc).toHaveBeenCalledTimes(2)
    // First attempt uses the clean slug; the retry adds a `-2` suffix.
    expect(rpc.mock.calls[0][1].p_id).toBe('kyoto-spring-2026')
    expect(rpc.mock.calls[1][1].p_id).toBe('kyoto-spring-2026-2')
    expect(id).toBe('kyoto-spring-2026-2')
  })

  it('returns the clean slug when the first insert succeeds', async () => {
    rpc.mockResolvedValueOnce({ data: { ok: true }, error: null })
    const qc = new QueryClient()
    const { result } = renderHook(() => useCreateTrip(), { wrapper: wrapper(qc) })

    let id = ''
    await act(async () => {
      id = await result.current.mutateAsync({ slug: '', title: 'Paris', subtitle: '', start: '', end: '' })
    })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(id).toBe('paris')
  })

  it('fails fast on a non-retryable reason', async () => {
    rpc.mockResolvedValueOnce({ data: { ok: false, reason: 'no_credits' }, error: null })
    const qc = new QueryClient()
    const { result } = renderHook(() => useCreateTrip(), { wrapper: wrapper(qc) })

    let caught: unknown
    await act(async () => {
      try { await result.current.mutateAsync({ slug: '', title: 'X', subtitle: '', start: '', end: '' }) }
      catch (e) { caught = e }
    })
    expect((caught as Error).message).toBe('no_credits')
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('throws after exhausting the retry budget on persistent collisions', async () => {
    rpc.mockResolvedValue({ data: { ok: false, reason: 'slug_taken' }, error: null })
    const qc = new QueryClient()
    const { result } = renderHook(() => useCreateTrip(), { wrapper: wrapper(qc) })

    let caught: unknown
    await act(async () => {
      try { await result.current.mutateAsync({ slug: '', title: 'Busy', subtitle: '', start: '', end: '' }) }
      catch (e) { caught = e }
    })
    expect((caught as Error).message).toBe('slug_taken')
    expect(rpc).toHaveBeenCalledTimes(5)
  })
})
