import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { usePrewarmDescriptions, PREWARM_BATCH_MAX } from './usePrewarmDescriptions'

vi.mock('../lib/enrichClient', () => ({ fetchPlaceDescriptionsBatch: vi.fn(async () => ({})) }))

const wrap = ({ children }: { children: React.ReactNode }) =>
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>

describe('usePrewarmDescriptions', () => {
  it('caps the batch at PREWARM_BATCH_MAX and de-dupes', async () => {
    const { fetchPlaceDescriptionsBatch } = await import('../lib/enrichClient')
    const ids = Array.from({ length: PREWARM_BATCH_MAX + 10 }, (_, i) => 'p' + i)
    renderHook(() => usePrewarmDescriptions([...ids, ids[0]]), { wrapper: wrap })
    await Promise.resolve()
    const called = (fetchPlaceDescriptionsBatch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string[]
    expect(called.length).toBe(PREWARM_BATCH_MAX)
  })
  it('no ids → no call', async () => {
    const { fetchPlaceDescriptionsBatch } = await import('../lib/enrichClient')
    renderHook(() => usePrewarmDescriptions([]), { wrapper: wrap })
    expect(fetchPlaceDescriptionsBatch).not.toHaveBeenCalled()
  })
})
