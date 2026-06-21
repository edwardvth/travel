import { isCompleted } from '../helpers'
import { stopLandmarkQuery } from '../landmark-context'

/** First not-completed stop index in `dayIndex`, or -1 if all done. Pure. */
export function currentStopIndex(dayIndex: number, stopNames: string[], completed: string[] | undefined): number {
  for (let i = 0; i < stopNames.length; i++) {
    if (!isCompleted(completed, dayIndex, i)) return i
  }
  return -1
}

/** Wikipedia query for a stop's hero image — ALWAYS name + city. Pure. */
export function stopHeroQuery(stopName: string, destination: string): string {
  return stopLandmarkQuery(stopName, destination)
}

/**
 * Which day Guide should show. When `today` (a local `YYYY-MM-DD` string) falls
 * within `[startDate, startDate + dayCount)` we surface that day so the live
 * companion is anchored to the day you're actually on; otherwise we fall back to
 * the planner's selected `fallbackDay` (clamped into range). Pure + unit-tested.
 *
 * `startDate` is an ISO `YYYY-MM-DD` (or null/invalid → always the fallback).
 */
export function activeDayIndex(
  startDate: string | null | undefined,
  dayCount: number,
  fallbackDay: number,
  today: string,
): number {
  const clampedFallback = Math.min(Math.max(fallbackDay, 0), Math.max(0, dayCount - 1))
  if (!startDate || dayCount <= 0) return clampedFallback
  const start = parseYmd(startDate)
  const now = parseYmd(today)
  if (start == null || now == null) return clampedFallback
  const diffDays = Math.round((now - start) / 86_400_000)
  if (diffDays >= 0 && diffDays < dayCount) return diffDays
  return clampedFallback
}

/** The DayNav's neighbor + boundary model for a focused day. Pure + unit-tested. */
export interface DayNavModel {
  prevLabel: string | null
  activeLabel: string
  nextLabel: string | null
  atStart: boolean
  atEnd: boolean
}

/**
 * Derive the DayNav's labels and boundary flags for a focused `dayIndex` within
 * a trip of `dayCount` days, given the per-day `dayLabels` (e.g. "Aug 5"). The
 * active label is always present (falls back to "Day N"); `prevLabel`/`nextLabel`
 * are null at the respective boundary, where `atStart`/`atEnd` go true so the
 * caller can offer an Add-Day affordance in place of the missing neighbour. Pure.
 */
export function dayNavModel(
  dayIndex: number,
  dayCount: number,
  dayLabels: string[] | undefined,
): DayNavModel {
  const labels = dayLabels ?? []
  const labelAt = (i: number): string => labels[i] || `Day ${i + 1}`
  const atStart = dayIndex <= 0
  const atEnd = dayIndex >= dayCount - 1
  return {
    prevLabel: atStart ? null : labelAt(dayIndex - 1),
    activeLabel: labelAt(dayIndex),
    nextLabel: atEnd ? null : labelAt(dayIndex + 1),
    atStart,
    atEnd,
  }
}

/** Parse a local `YYYY-MM-DD` into a midnight-local epoch ms, or null. */
function parseYmd(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d.getTime()
}
