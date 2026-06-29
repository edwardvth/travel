import type { TripData, Day } from '../types'
import { moveItem, remapCompletedAfterDayReorder, remapCompletedAfterDayDelete } from './itinerary-helpers'

/**
 * Pure, immutable day mutations on `TripData`. Each returns a new `TripData`
 * with `data.days` and `data.completed` kept consistent (the positional
 * `config.dayLabels`/dates are deliberately untouched — reordering keeps the
 * calendar fixed and moves the content). Mirrors the stop-level transforms in
 * `StopList`; the day-index churn is handled by the day-level remappers.
 */

/** Append a new empty day. Existing `completed` keys are unaffected (append = end). */
export function addDay(data: TripData): TripData {
  const day: Day = { title: `Day ${data.days.length + 1}`, stops: [] }
  return { ...data, days: [...data.days, day] }
}

/** Remove the day at `index`, dropping its done-state and shifting higher days down. */
export function removeDay(data: TripData, index: number): TripData {
  if (index < 0 || index >= data.days.length) return data
  return {
    ...data,
    days: data.days.filter((_, i) => i !== index),
    completed: remapCompletedAfterDayDelete(data.completed, index),
  }
}

/** Move the day at `from` to `to`, remapping the day component of `completed`. */
export function reorderDays(data: TripData, from: number, to: number): TripData {
  if (from === to) return data
  const days = moveItem(data.days, from, to)
  // The same move applied to the indices gives order[newIndex] = oldIndex.
  const order = moveItem(data.days.map((_, i) => i), from, to)
  return { ...data, days, completed: remapCompletedAfterDayReorder(data.completed, order) }
}

/** Edit a day's title and/or note immutably. An empty/whitespace note is removed. */
export function setDayMeta(data: TripData, index: number, meta: { title?: string; note?: string }): TripData {
  if (index < 0 || index >= data.days.length) return data
  const days = data.days.map((d, i) => {
    if (i !== index) return d
    const next: Day = { ...d }
    if (meta.title !== undefined) next.title = meta.title
    if (meta.note !== undefined) {
      if (meta.note.trim()) next.note = meta.note
      else delete next.note
    }
    return next
  })
  return { ...data, days }
}
