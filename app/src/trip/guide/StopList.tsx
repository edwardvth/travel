import type { Stop } from '../../types'
import type { DayStopRow } from './guide-helpers'
import { UpcomingRow } from './UpcomingRow'

/**
 * The active + upcoming stop list — the **not-completed** stops for the focused
 * day, in order (completed stops live in the separate collapsible
 * `CompletedSection` above; the focused stop is the hero card the orchestrator
 * renders in its own slot above this list). `done` rows are filtered out here so
 * they never interleave with the active flow, and the **focused** stop is skipped
 * too (it's the hero, not a row). Every remaining stop renders a quiet, tappable
 * `UpcomingRow` that focuses it on tap.
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
  onFocus,
}: {
  stops: Stop[]
  rows: DayStopRow[]
  focusedStopIndex: number
  /** Right-aligned mono meta per stop index (e.g. an ETA "12 MIN"); '' to omit. */
  rowMeta: (index: number) => string
  onFocus: (index: number) => void
}) {
  // Active (current + upcoming) stops only, minus the focused one (the hero).
  const activeRows = rows.filter(row => row.status !== 'done' && row.index !== focusedStopIndex)
  if (activeRows.length === 0) return null
  return (
    <div className="space-y-1.5">
      {activeRows.map(row => {
        const stop = stops[row.index]
        if (!stop) return null
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
