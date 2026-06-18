import { describe, it, expect } from 'vitest'
import { splitTrips } from './useTrips'
import type { Trip } from '../types'

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
