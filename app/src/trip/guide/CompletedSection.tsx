import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import type { Stop } from '../../types'
import type { CompletedStop } from './guide-helpers'
import { UpcomingRow } from './UpcomingRow'

/**
 * The expanded body of the **Completed Stops** disclosure. The *toggle* lives on
 * the Guide progress header's "n complete · names" line (`GuideProgress`); this
 * component renders the completed rows when `open`, keeping the day's completed
 * stops out of the main flow so the active stop stays the hero while every
 * completed stop is one tap away.
 *
 * Rows are quiet `UpcomingRow` `done` rows in **original itinerary order** (the
 * orchestrator passes them pre-ordered), each tappable to focus/reopen (which
 * surfaces it in the hero slot above) and edit-gated tap-to-undo on the ✓. The
 * open state is purely user-controlled — focusing a completed stop never forces
 * this open, because the focused card lives in its own hero slot, not here.
 *
 * Pure presentation: the orchestrator owns the data, the open state and all
 * callbacks. Expanding/collapsing never reorders anything — order is fixed by
 * `completed`.
 */
export function CompletedSection({
  stops,
  completed,
  open,
  panelId,
  rowMeta,
  onFocus,
  onToggleComplete,
  canComplete,
}: {
  /** All stops for the focused day (indexed by the completed rows' `index`). */
  stops: Stop[]
  /** Completed stops in original itinerary order. */
  completed: CompletedStop[]
  /** Whether the disclosure is open (user-controlled only). */
  open: boolean
  /** id matching the `GuideProgress` toggle's `aria-controls`. */
  panelId: string
  /** Right-aligned mono meta per stop index (e.g. "12 MIN"); '' to omit. */
  rowMeta: (index: number) => string
  onFocus: (index: number) => void
  onToggleComplete: (index: number) => void
  canComplete: boolean
}) {
  const reduce = useReducedMotion() ?? false
  if (completed.length === 0) return null

  // Smoothly grow/shrink height + fade; `overflow-hidden` clips during the
  // collapse so rows don't spill. Reduced motion → instant (duration 0).
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="completed-panel"
          id={panelId}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.28, ease: [0.4, 0, 0.2, 1] }}
          className="overflow-hidden"
        >
          <div className="mb-3 pl-1 pt-1.5 space-y-1.5">
            {completed.map(c => {
              const stop = stops[c.index]
              if (!stop) return null
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
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default CompletedSection
