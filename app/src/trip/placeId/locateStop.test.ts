import { describe, it, expect } from 'vitest'
import { locateStop } from './locateStop'
import type { Trip } from '../../types'

const trip = (days: { name: string; placeId?: string }[][]): Trip => ({
  id: 't', owner_id: null, title: 'T', subtitle: null, config: {},
  data: { days: days.map(stops => ({ title: '', stops })), completed: [] },
}) as Trip

describe('locateStop', () => {
  it('matches at the exact index when name matches + still untagged', () => {
    const t = trip([[{ name: 'A' }, { name: 'Arch' }]])
    expect(locateStop(t, 0, 1, 'Arch')).toEqual({ dayIndex: 0, stopIndex: 1 })
  })

  it('finds by name within the day after a shift', () => {
    const t = trip([[{ name: 'Arch' }, { name: 'A' }]]) // Arch moved to index 0
    expect(locateStop(t, 0, 1, 'Arch')).toEqual({ dayIndex: 0, stopIndex: 0 })
  })

  it('finds by name across the trip when the day changed', () => {
    const t = trip([[{ name: 'A' }], [{ name: 'B' }, { name: 'Arch' }]])
    expect(locateStop(t, 0, 0, 'Arch')).toEqual({ dayIndex: 1, stopIndex: 1 })
  })

  it('skips a same-name stop that is already tagged', () => {
    const t = trip([[{ name: 'Arch', placeId: 'p1' }, { name: 'Arch' }]])
    expect(locateStop(t, 0, 0, 'Arch')).toEqual({ dayIndex: 0, stopIndex: 1 })
  })

  it('returns null when the stop is gone', () => {
    const t = trip([[{ name: 'A' }]])
    expect(locateStop(t, 0, 5, 'Arch')).toBeNull()
  })
})
