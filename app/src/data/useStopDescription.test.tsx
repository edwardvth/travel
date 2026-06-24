import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useStopDescription } from './useStopDescription'
import type { Stop } from '../types'

vi.mock('../lib/enrichClient', () => ({
  fetchPlaceDescription: vi.fn(async () => ({ state: 'ready', content: { history: 'LibH', facts: ['x'], tips: 'LibT', notice: '' } })),
}))

const wrap = ({ children }: { children: React.ReactNode }) =>
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>

describe('useStopDescription', () => {
  it('placeId stop → reads the library', async () => {
    const stop = { name: 'X', placeId: 'p1' } as Stop
    const { result } = renderHook(() => useStopDescription(stop), { wrapper: wrap })
    await waitFor(() => expect(result.current.state).toBe('ready'))
    expect(result.current.history).toBe('LibH')
    expect(result.current.facts).toEqual(['x'])
  })
  it('by-name stop → uses the stop fields, no fetch', async () => {
    const { fetchPlaceDescription } = await import('../lib/enrichClient')
    const stop = { name: 'Typed', history: 'OwnH', facts: ['f'], tips: 'OwnT' } as Stop
    const { result } = renderHook(() => useStopDescription(stop), { wrapper: wrap })
    expect(result.current.history).toBe('OwnH')
    expect(result.current.state).toBe('ready')
    expect(fetchPlaceDescription).not.toHaveBeenCalled()
  })
})
