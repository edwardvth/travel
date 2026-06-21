import type { ReactNode } from 'react'
import type { Stop } from '../../types'
import type { DayStopRow } from './guide-helpers'
import { UpcomingRow } from './UpcomingRow'

/**
 * The active + upcoming stop list — the **not-completed** stops for the focused
 * day, in order (completed stops live in the separate collapsible
 * `CompletedSection` above this list). Each row is classified (current /
 * upcoming) by the orchestrator via `dayStopRows`; `done` rows are filtered out
 * here so they never interleave with the active flow:
 *
 *  - The **focused** stop renders its expanded card via the `focusedCard` slot
 *    (the orchestrator owns that heavy wiring — telemetry, hero, enrichment). When
 *    the focused stop is completed its card renders in the CompletedSection
 *    instead, so it won't match any row here.
 *  - Every **other** stop renders a quiet, tappable `UpcomingRow` that focuses +
 *    expands it on tap.
 *
 * Pure presentation: the orchestrator owns `focusedStopIndex`, the completed set
 * and all callbacks; this component just lays the rows out. It never reorders or
 * mutates stops — it only surfaces focus intent.
 */
export function StopList({
  stops,
  rows,
  focusedStopIndex,
  rowMeta,
  focusedCard,
  onFocus,
}: {
  stops: Stop[]
  rows: DayStopRow[]
  focusedStopIndex: number
  /** Right-aligned mono meta per stop index (e.g. an ETA "12 MIN"); '' to omit. */
  rowMeta: (index: number) => string
  /** The expanded card for the focused stop (rendered in place of its row). */
  focusedCard: ReactNode
  onFocus: (index: number) => void
}) {
  // Completed stops are surfaced in the CompletedSection above; this list is the
  // active (current) + upcoming stops only.
  const activeRows = rows.filter(row => row.status !== 'done')
  return (
    <div className="space-y-1.5">
      {activeRows.map(row => {
        const stop = stops[row.index]
        if (!stop) return null
        if (row.index === focusedStopIndex) {
          // Stable key (not the row index) so the focused slot persists when the
          // focus advances to another stop — that lets the card's own
          // AnimatePresence run its flip instead of remounting silently.
          return <div key="focused-card">{focusedCard}</div>
        }
        return (
          <UpcomingRow
            key={row.index}
            index={row.index + 1}
            name={stop.name}
            meta={rowMeta(row.index)}
            onClick={() => onFocus(row.index)}
          />
        )
      })}
    </div>
  )
}

export default StopList
