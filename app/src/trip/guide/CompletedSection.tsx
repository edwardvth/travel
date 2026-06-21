import { type ReactNode } from 'react'
import type { Stop } from '../../types'
import type { CompletedStop } from './guide-helpers'
import { UpcomingRow } from './UpcomingRow'

/**
 * The expanded body of the **Completed Stops** disclosure. The *toggle* lives on
 * the Guide progress header's "n complete · names" line (`GuideProgress`); this
 * component renders only the rows when `open`, keeping the day's completed stops
 * out of the main flow so the active stop stays the hero while every completed
 * stop is one tap away.
 *
 * Rows are quiet `UpcomingRow` `done` rows in **original itinerary order** (the
 * orchestrator passes them pre-ordered), each tappable to focus/reopen (expanding
 * `focusedCard` in place of its row) and edit-gated tap-to-undo on the ✓.
 *
 * Pure presentation: the orchestrator owns the data, the open state (incl. the
 * "force open when a completed stop is focused" rule) and all callbacks.
 * Expanding/collapsing never reorders anything — order is fixed by `completed`.
 */
export function CompletedSection({
  stops,
  completed,
  open,
  panelId,
  focusedStopIndex,
  focusedCard,
  rowMeta,
  onFocus,
  onToggleComplete,
  canComplete,
}: {
  /** All stops for the focused day (indexed by the completed rows' `index`). */
  stops: Stop[]
  /** Completed stops in original itinerary order. */
  completed: CompletedStop[]
  /** Whether the disclosure is open (owns the focused-completed force-open rule). */
  open: boolean
  /** id matching the `GuideProgress` toggle's `aria-controls`. */
  panelId: string
  focusedStopIndex: number
  /** The expanded card for the focused stop (rendered in place of its row). */
  focusedCard: ReactNode
  /** Right-aligned mono meta per stop index (e.g. "12 MIN"); '' to omit. */
  rowMeta: (index: number) => string
  onFocus: (index: number) => void
  onToggleComplete: (index: number) => void
  canComplete: boolean
}) {
  if (completed.length === 0 || !open) return null

  return (
    <div id={panelId} className="mb-3 pl-1 space-y-1.5">
      {completed.map(c => {
        const stop = stops[c.index]
        if (!stop) return null
        if (c.index === focusedStopIndex) {
          return <div key={c.index}>{focusedCard}</div>
        }
        return (
          <UpcomingRow
            key={c.index}
            index={c.index + 1}
            name={stop.name}
            meta={rowMeta(c.index)}
            done
            onClick={() => onFocus(c.index)}
            onToggleComplete={canComplete ? () => onToggleComplete(c.index) : undefined}
          />
        )
      })}
    </div>
  )
}

export default CompletedSection
