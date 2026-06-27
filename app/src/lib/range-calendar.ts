/**
 * Pure logic for the command pill's anchored range calendar. No React, no Date
 * timezone hazards: all values are local `YYYY-MM-DD` strings (the format
 * `buildNewTripPayload` parses) and months are 0-based like `Date.getMonth()`.
 */

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTHS_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December']

export interface YMD { y: number; m: number; d: number } // m 0-based
export interface YM { y: number; m: number }             // m 0-based
export interface DateRange { start: string | null; end: string | null }
export interface DayCell { iso: string; day: number; inMonth: boolean }

/** Local `YYYY-MM-DD` for a Y/M(0-based)/D — never touches UTC. */
export function isoOf({ y, m, d }: YMD): string {
  const mm = String(m + 1).padStart(2, '0')
  const dd = String(d).padStart(2, '0')
  return `${y}-${mm}-${dd}`
}

/** Parse a `YYYY-MM-DD` back to YMD (m 0-based). */
export function parseISO(iso: string): YMD {
  const [y, m, d] = iso.split('-').map(Number)
  return { y, m: m - 1, d }
}

/** 0-based weekday (Sun=0) of the 1st of a month, via a noon Date (DST-safe). */
function firstWeekday(y: number, m: number): number {
  return new Date(y, m, 1, 12).getDay()
}
/** Days in a month (m 0-based). */
function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0, 12).getDate()
}

/** A 42-cell (6×7) grid for the month, with adjacent-month spill cells. */
export function monthGrid(y: number, m: number): DayCell[] {
  const lead = firstWeekday(y, m)
  const cells: DayCell[] = []
  // leading days from previous month
  const prevM = addMonths({ y, m }, -1)
  const prevCount = daysInMonth(prevM.y, prevM.m)
  for (let i = lead - 1; i >= 0; i--) {
    const d = prevCount - i
    cells.push({ iso: isoOf({ ...prevM, d }), day: d, inMonth: false })
  }
  // current month
  const count = daysInMonth(y, m)
  for (let d = 1; d <= count; d++) cells.push({ iso: isoOf({ y, m, d }), day: d, inMonth: true })
  // trailing days to fill 42
  const nextM = addMonths({ y, m }, 1)
  let d = 1
  while (cells.length < 42) { cells.push({ iso: isoOf({ ...nextM, d }), day: d, inMonth: false }); d++ }
  return cells
}

/** Two-click range machine: 1st = start, 2nd = end (swaps if earlier), 3rd = restart. */
export function applyRangeClick(r: DateRange, iso: string): DateRange {
  if (!r.start || r.end) return { start: iso, end: null }       // fresh / restart
  if (iso < r.start) return { start: iso, end: r.start }         // swap
  return { start: r.start, end: iso }
}

export function isStart(r: DateRange, iso: string): boolean { return !!r.start && iso === r.start }
export function isEnd(r: DateRange, iso: string): boolean { return !!r.end && iso === r.end }
/** Strictly between start and end (the soft claret band). */
export function inBand(r: DateRange, iso: string): boolean {
  return !!r.start && !!r.end && iso > r.start && iso < r.end
}

function chipDate(iso: string): string {
  const { m, d } = parseISO(iso)
  return `${MONTHS_SHORT[m]} ${d}`
}
/** "Jul 14 → Jul 18" | "Jul 14" | "". */
export function formatRangeChip(r: DateRange): string {
  if (r.start && r.end) return `${chipDate(r.start)} → ${chipDate(r.end)}`
  if (r.start) return chipDate(r.start)
  return ''
}

export function addMonths(ym: YM, delta: number): YM {
  const total = ym.y * 12 + ym.m + delta
  return { y: Math.floor(total / 12), m: ((total % 12) + 12) % 12 }
}

/** Add (or subtract) whole days to a `YYYY-MM-DD`, crossing month/year boundaries. Local-date safe. */
export function addDays(iso: string, delta: number): string {
  const { y, m, d } = parseISO(iso)
  const dt = new Date(y, m, d + delta, 12)   // noon-anchored → DST-safe
  return isoOf({ y: dt.getFullYear(), m: dt.getMonth(), d: dt.getDate() })
}
export function monthLabel({ y, m }: YM): string { return `${MONTHS_LONG[m]} ${y}` }
