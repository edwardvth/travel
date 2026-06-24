import { describe, it, expect } from 'vitest'
import { addDay, removeDay, reorderDays, setDayMeta } from './day-mutations'
import type { TripData } from '../types'

const base = (): TripData => ({
  days: [
    { title: 'D1', stops: [{ name: 'a' }] },
    { title: 'D2', stops: [{ name: 'b' }, { name: 'c' }] },
    { title: 'D3', stops: [] },
  ],
  completed: ['0-0', '1-1', '1-0'],
})

describe('day-mutations', () => {
  it('addDay appends an empty day and leaves completed untouched', () => {
    const b = base()
    const out = addDay(b)
    expect(out.days).toHaveLength(4)
    expect(out.days[3].stops).toEqual([])
    expect(out.completed).toEqual(b.completed)
    expect(out).not.toBe(b) // immutable
  })

  it('removeDay drops the day and remaps completed', () => {
    const out = removeDay(base(), 0) // removing day 0 shifts day 1 -> 0
    expect(out.days.map(d => d.title)).toEqual(['D2', 'D3'])
    expect(out.completed.sort()).toEqual(['0-0', '0-1'].sort()) // '1-1'/'1-0' -> '0-1'/'0-0'
  })

  it('reorderDays moves a day and remaps completed', () => {
    const out = reorderDays(base(), 0, 2) // order [1,2,0]; day 0 -> position 2
    expect(out.days.map(d => d.title)).toEqual(['D2', 'D3', 'D1'])
    expect(out.completed).toContain('2-0') // day 0's '0-0' -> '2-0'
  })

  it('setDayMeta edits title/note immutably and drops an empty note', () => {
    const b = base()
    const out = setDayMeta(b, 1, { title: 'New', note: '' })
    expect(out.days[1].title).toBe('New')
    expect('note' in out.days[1]).toBe(false)
    expect(out.days[1].stops).toBe(b.days[1].stops) // stops referenced, untouched
  })

  it('setDayMeta sets a non-empty note', () => {
    const out = setDayMeta(base(), 0, { note: 'pack sunscreen' })
    expect(out.days[0].note).toBe('pack sunscreen')
  })

  it('out-of-range index is a no-op', () => {
    const b = base()
    expect(removeDay(b, 9)).toBe(b)
    expect(setDayMeta(b, -1, { title: 'x' })).toBe(b)
    expect(reorderDays(b, 1, 1)).toBe(b)
  })
})
