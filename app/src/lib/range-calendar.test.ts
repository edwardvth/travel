import { describe, it, expect } from 'vitest'
import {
  isoOf, monthGrid, applyRangeClick, inBand, isEnd, isStart,
  formatRangeChip, addMonths, monthLabel,
} from './range-calendar'

describe('isoOf', () => {
  it('formats local Y-M-D with no UTC shift', () => {
    expect(isoOf({ y: 2026, m: 6, d: 14 })).toBe('2026-07-14') // m is 0-based
    expect(isoOf({ y: 2026, m: 0, d: 1 })).toBe('2026-01-01')
  })
})

describe('monthGrid', () => {
  it('returns 42 cells (6 weeks) with leading/trailing days of adjacent months', () => {
    const cells = monthGrid(2026, 6) // July 2026 (0-based month)
    expect(cells).toHaveLength(42)
    // July 1 2026 is a Wednesday → 3 leading June cells (Sun..Tue)
    expect(cells[0].inMonth).toBe(false)
    expect(cells[3]).toMatchObject({ iso: '2026-07-01', inMonth: true })
    expect(cells.find(c => c.iso === '2026-07-31')?.inMonth).toBe(true)
  })
})

describe('applyRangeClick', () => {
  it('first click sets start, clears end', () => {
    expect(applyRangeClick({ start: null, end: null }, '2026-07-14'))
      .toEqual({ start: '2026-07-14', end: null })
  })
  it('second click after start sets end', () => {
    expect(applyRangeClick({ start: '2026-07-14', end: null }, '2026-07-18'))
      .toEqual({ start: '2026-07-14', end: '2026-07-18' })
  })
  it('second click before start swaps so start <= end', () => {
    expect(applyRangeClick({ start: '2026-07-18', end: null }, '2026-07-14'))
      .toEqual({ start: '2026-07-14', end: '2026-07-18' })
  })
  it('clicking again when a full range exists restarts from the new start', () => {
    expect(applyRangeClick({ start: '2026-07-14', end: '2026-07-18' }, '2026-07-20'))
      .toEqual({ start: '2026-07-20', end: null })
  })
})

describe('band membership', () => {
  const r = { start: '2026-07-14', end: '2026-07-18' }
  it('isStart / isEnd', () => {
    expect(isStart(r, '2026-07-14')).toBe(true)
    expect(isEnd(r, '2026-07-18')).toBe(true)
    expect(isStart(r, '2026-07-15')).toBe(false)
  })
  it('inBand is true strictly between start and end', () => {
    expect(inBand(r, '2026-07-15')).toBe(true)
    expect(inBand(r, '2026-07-14')).toBe(false) // start is not "band", it's the end-cap
    expect(inBand(r, '2026-07-19')).toBe(false)
  })
  it('inBand is false when range is incomplete', () => {
    expect(inBand({ start: '2026-07-14', end: null }, '2026-07-15')).toBe(false)
  })
})

describe('formatRangeChip', () => {
  it('formats a complete range', () => {
    expect(formatRangeChip({ start: '2026-07-14', end: '2026-07-18' })).toBe('Jul 14 → Jul 18')
  })
  it('formats a single picked start', () => {
    expect(formatRangeChip({ start: '2026-07-14', end: null })).toBe('Jul 14')
  })
  it('returns empty for no selection', () => {
    expect(formatRangeChip({ start: null, end: null })).toBe('')
  })
})

describe('month navigation', () => {
  it('addMonths wraps years', () => {
    expect(addMonths({ y: 2026, m: 11 }, 1)).toEqual({ y: 2027, m: 0 })
    expect(addMonths({ y: 2026, m: 0 }, -1)).toEqual({ y: 2025, m: 11 })
  })
  it('monthLabel is human', () => {
    expect(monthLabel({ y: 2026, m: 6 })).toBe('July 2026')
  })
})
