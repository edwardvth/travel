import { completedKey } from './helpers'

/**
 * Pure helpers for the itinerary's stop mutations. These keep `data.completed`
 * (an array of `"<day>-<stop>"` keys) consistent when stops within a day are
 * reordered or deleted.
 *
 * Legacy `Trip.html` treats done-state as purely positional (it never reindexes
 * `completed`), which means reordering/deleting silently moves the checkmark to
 * whatever stop now sits at that index. We improve on that faithfully here:
 * done-state follows the *stop*, so after a move/delete the right row stays done.
 */

/** Immutably move the item at `from` to `to` within `arr`. */
export function moveItem<T>(arr: readonly T[], from: number, to: number): T[] {
  const next = arr.slice()
  if (from < 0 || from >= next.length || to < 0 || to >= next.length || from === to) {
    return next
  }
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

/**
 * Build the new `completed` array after reordering stops within `day`.
 * Keys for *other* days pass through untouched; keys for `day` are remapped from
 * their old index to their new index via `order` (where `order[newIndex]` is the
 * old index, i.e. the arrayMove result of the original indices).
 */
export function remapCompletedAfterReorder(
  completed: readonly string[] | undefined,
  day: number,
  order: readonly number[],
): string[] {
  if (!completed?.length) return []
  // oldIndex -> newIndex lookup for this day.
  const oldToNew = new Map<number, number>()
  order.forEach((oldIndex, newIndex) => { oldToNew.set(oldIndex, newIndex) })

  const out: string[] = []
  for (const key of completed) {
    const parsed = parseKey(key)
    if (!parsed || parsed.day !== day) {
      out.push(key)
      continue
    }
    const newIndex = oldToNew.get(parsed.stop)
    if (newIndex !== undefined) out.push(completedKey(day, newIndex))
    // If the old index isn't in `order` it's stale — drop it.
  }
  return out
}

/**
 * Build the new `completed` array after deleting the stop at `removedIndex`
 * within `day`. The removed key is dropped; higher indices in that day shift
 * down by one. Other days are untouched.
 */
export function remapCompletedAfterDelete(
  completed: readonly string[] | undefined,
  day: number,
  removedIndex: number,
): string[] {
  if (!completed?.length) return []
  const out: string[] = []
  for (const key of completed) {
    const parsed = parseKey(key)
    if (!parsed || parsed.day !== day) {
      out.push(key)
      continue
    }
    if (parsed.stop === removedIndex) continue // the deleted stop
    const shifted = parsed.stop > removedIndex ? parsed.stop - 1 : parsed.stop
    out.push(completedKey(day, shifted))
  }
  return out
}

/** Toggle a single day/stop key in the completed array (immutable). */
export function toggleCompleted(
  completed: readonly string[] | undefined,
  day: number,
  stop: number,
): string[] {
  const key = completedKey(day, stop)
  const base = completed ?? []
  return base.includes(key) ? base.filter(k => k !== key) : [...base, key]
}

/**
 * Day-level analogs of the stop-level remappers above. `completed` keys are
 * `"<day>-<stop>"`; adding/removing/reordering a DAY shifts the `<day>`
 * component while the stop index rides along. Other days pass through.
 */

/** After reordering days, remap the day component of each key. `order[newDay] = oldDay`. */
export function remapCompletedAfterDayReorder(completed: readonly string[] | undefined, order: readonly number[]): string[] {
  if (!completed?.length) return []
  const oldToNew = new Map<number, number>()
  order.forEach((oldDay, newDay) => oldToNew.set(oldDay, newDay))
  const out: string[] = []
  for (const key of completed) {
    const p = parseKey(key); if (!p) { out.push(key); continue }
    const nd = oldToNew.get(p.day)
    if (nd !== undefined) out.push(completedKey(nd, p.stop))
    // a day not in `order` is stale — drop it
  }
  return out
}

/** After deleting `removedDay`, drop its keys and shift higher days down by one. */
export function remapCompletedAfterDayDelete(completed: readonly string[] | undefined, removedDay: number): string[] {
  if (!completed?.length) return []
  const out: string[] = []
  for (const key of completed) {
    const p = parseKey(key); if (!p) { out.push(key); continue }
    if (p.day === removedDay) continue
    out.push(completedKey(p.day > removedDay ? p.day - 1 : p.day, p.stop))
  }
  return out
}

/** After inserting a day at `insertDay`, shift days at/after it up by one. */
export function remapCompletedAfterDayInsert(completed: readonly string[] | undefined, insertDay: number): string[] {
  if (!completed?.length) return []
  const out: string[] = []
  for (const key of completed) {
    const p = parseKey(key); if (!p) { out.push(key); continue }
    out.push(completedKey(p.day >= insertDay ? p.day + 1 : p.day, p.stop))
  }
  return out
}

/** Map a selected day index through a day reorder (`order[newDay] = oldDay`). */
export function followDayAfterReorder(selected: number, order: readonly number[]): number {
  const i = order.indexOf(selected)
  return i >= 0 ? i : selected
}

/** Map a selected day index through a day delete. Caller clamps to `days.length - 1`. */
export function followDayAfterDelete(selected: number, removedDay: number): number {
  return selected > removedDay ? selected - 1 : selected
}

function parseKey(key: string): { day: number; stop: number } | null {
  const dash = key.indexOf('-')
  if (dash <= 0) return null
  const day = Number(key.slice(0, dash))
  const stop = Number(key.slice(dash + 1))
  if (!Number.isInteger(day) || !Number.isInteger(stop)) return null
  return { day, stop }
}
