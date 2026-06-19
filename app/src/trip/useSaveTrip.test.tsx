import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useSaveTrip } from './useSaveTrip'
import { tripKey } from './useTrip'
import type { Trip } from '../types'

// Mock the supabase client; `upsert` resolves to { error } like the real SDK.
const upsert = vi.fn()
vi.mock('../lib/supabase', () => ({
  supabase: { from: () => ({ upsert: (...args: unknown[]) => upsert(...args) }) },
}))

function makeTrip(): Trip {
  return {
    id: 't1',
    owner_id: null,
    title: 'Paris',
    subtitle: null,
    config: { dayLabels: [] },
    data: { days: [], completed: [], hotel: null },
  } as unknown as Trip
}

function wrapper(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

describe('useSaveTrip', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    upsert.mockReset()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('re-queues a failed upsert and retries until it succeeds (no edit dropped)', async () => {
    const qc = new QueryClient()
    qc.setQueryData<Trip>(tripKey('t1'), makeTrip())

    // First upsert fails, second succeeds.
    upsert
      .mockResolvedValueOnce({ error: { message: 'network down' } })
      .mockResolvedValueOnce({ error: null })

    const { result } = renderHook(() => useSaveTrip('t1', true), { wrapper: wrapper(qc) })

    act(() => {
      result.current.save({ title: 'Paris (edited)' })
    })

    // Flush the 800ms debounce -> first (failing) upsert.
    await act(async () => {
      vi.advanceTimersByTime(800)
      await Promise.resolve()
    })
    expect(upsert).toHaveBeenCalledTimes(1)
    // Failure surfaces as an error so SyncIndicator's "retrying" is truthful.
    expect(result.current.error).not.toBeNull()
    expect(result.current.lastSavedAt).toBeNull()

    // Advance past the first backoff delay (3000ms) -> retry succeeds.
    await act(async () => {
      vi.advanceTimersByTime(3000)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(upsert).toHaveBeenCalledTimes(2)
    // The edit's title made it into the second (successful) upsert payload.
    expect(upsert.mock.calls[1][0]).toMatchObject({ id: 't1', title: 'Paris (edited)' })
    // saveError clears on success.
    expect(result.current.error).toBeNull()
    expect(result.current.lastSavedAt).not.toBeNull()
    expect(result.current.saving).toBe(false)
  })
})
