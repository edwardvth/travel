import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useByNameEnrichment } from './useByNameEnrichment'
import type { Stop, Trip } from '../types'

vi.mock('../trip/enrich', () => ({ generateStopDetail: vi.fn(async () => ({ history: 'GenH', facts: ['g'], tips: 'GenT', notice: '' })) }))
vi.mock('../trip/landmark-context', () => ({ destinationOf: () => 'Test City' }))

const mkTrip = (stops: Stop[]): Trip => ({ id: 't', owner_id: null, title: 'T', subtitle: null, config: {}, data: { days: [{ title: '', stops }], completed: [] } }) as Trip

describe('useByNameEnrichment', () => {
  beforeEach(() => vi.clearAllMocks())
  it('generates + saves for a by-name stop with no history', async () => {
    const stop = { name: 'Typed Place' } as Stop
    const save = vi.fn()
    renderHook(() => useByNameEnrichment(stop, mkTrip([stop]), save, true, 0, 0))
    await waitFor(() => expect(save).toHaveBeenCalled())
    const patched = save.mock.calls[0][0].data.days[0].stops[0]
    expect(patched.history).toBe('GenH')
    expect(patched.facts).toEqual(['g'])
  })
  it('skips a stop that has a placeId (library handles it)', async () => {
    const { generateStopDetail } = await import('../trip/enrich')
    const stop = { name: 'Arch', placeId: 'p1' } as Stop
    const save = vi.fn()
    renderHook(() => useByNameEnrichment(stop, mkTrip([stop]), save, true, 0, 0))
    await new Promise(r => setTimeout(r, 20))
    expect(generateStopDetail).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
  })
  it('skips when not editable, or when history already present', async () => {
    const { generateStopDetail } = await import('../trip/enrich')
    const save = vi.fn()
    renderHook(() => useByNameEnrichment({ name: 'A' } as Stop, mkTrip([{ name: 'A' } as Stop]), save, false, 0, 0))
    renderHook(() => useByNameEnrichment({ name: 'B', history: 'has' } as Stop, mkTrip([{ name: 'B', history: 'has' } as Stop]), save, true, 0, 0))
    await new Promise(r => setTimeout(r, 20))
    expect(generateStopDetail).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
  })
})
