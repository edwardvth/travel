import type { ReactNode } from 'react'
import type { Stop } from '../../types'
import type { DayStopRow } from './guide-helpers'
import { UpcomingRow } from './UpcomingRow'

/**
 * The full-day stop list — every stop for the focused day, in order. Each row is
 * classified (done / current / upcoming) by the orchestrator via `dayStopRows`:
 *
 *  - The **focused** stop renders its expanded card via the `focusedCard` slot
 *    (the orchestrator owns that heavy wiring — telemetry, hero, enrichment).
 *  - Every **other** stop renders a quiet, tappable `UpcomingRow` that focuses +
 *    expands it on tap; completed rows read muted with a ✓ and (edit-gated)
 *    expose tap-to-undo on that ✓.
 *
 * Pure presentation: the orchestrator owns `focusedStopIndex`, the completed set
 * and all callbacks; this component just lays the rows out. It never reorders or
 * mutates stops — it only surfaces focus + completion intent.
 */
export function StopList({
  stops,
  rows,
  focusedStopIndex,
  rowMeta,
  focusedCard,
  onFocus,
  onToggleComplete,
  canComplete,
}: {
  stops: Stop[]
  rows: DayStopRow[]
  focusedStopIndex: number
  /** Right-aligned mono meta per stop index (e.g. an ETA "12 MIN"); '' to omit. */
  rowMeta: (index: number) => string
  /** The expanded card for the focused stop (rendered in place of its row). */
  focusedCard: ReactNode
  onFocus: (index: number) => void
  onToggleComplete: (index: number) => void
  canComplete: boolean
}) {
  return (
    <div className="space-y-1.5">
      {rows.map(row => {
        const stop = stops[row.index]
        if (!stop) return null
        if (row.index === focusedStopIndex) {
          return <div key={row.index}>{focusedCard}</div>
        }
        return (
          <UpcomingRow
            key={row.index}
            index={row.index + 1}
            name={stop.name}
            meta={rowMeta(row.index)}
            done={row.status === 'done'}
            onClick={() => onFocus(row.index)}
            onToggleComplete={
              row.status === 'done' && canComplete ? () => onToggleComplete(row.index) : undefined
            }
          />
        )
      })}
    </div>
  )
}

export default StopList
