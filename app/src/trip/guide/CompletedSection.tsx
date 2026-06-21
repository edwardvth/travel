import { useId, type ReactNode } from 'react'
import type { Stop } from '../../types'
import type { CompletedStop } from './guide-helpers'
import { ChevronRight, Check } from '../icons'
import { UpcomingRow } from './UpcomingRow'

/**
 * The collapsible **Completed Stops** section that sits directly beneath the
 * Guide progress header, above the active + upcoming stops. It gathers the day's
 * completed stops out of the main flow so the active stop stays the hero, while
 * keeping every completed stop one tap away to revisit or reopen.
 *
 *  - **Header** — a ✓, "{n} Stops Complete" (singular "1 Stop Complete") and a
 *    faint preview of the names, with a chevron that mirrors the ManageSection
 *    disclosure (rotate on open, ≥44px target, aria-expanded/aria-controls).
 *  - **Expanded** — the completed stops as quiet `UpcomingRow` `done` rows, in
 *    **original itinerary order** (the orchestrator passes them pre-ordered), each
 *    tappable to focus/reopen (expanding `focusedCard` in place of its row) and
 *    edit-gated tap-to-undo on the ✓.
 *
 * Pure presentation: the orchestrator owns the data, the expanded state and all
 * callbacks. Expanding/collapsing never reorders anything — order is fixed by the
 * incoming `stops` list. Visually lighter than the active card by design — this is
 * a navigation/space affordance, not a duplicate of the progress bar.
 */
export function CompletedSection({
  stops,
  completed,
  expanded,
  onToggle,
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
  expanded: boolean
  onToggle: () => void
  focusedStopIndex: number
  /** The expanded card for the focused stop (rendered in place of its row). */
  focusedCard: ReactNode
  /** Right-aligned mono meta per stop index (e.g. "12 MIN"); '' to omit. */
  rowMeta: (index: number) => string
  onFocus: (index: number) => void
  onToggleComplete: (index: number) => void
  canComplete: boolean
}) {
  const panelId = useId()
  const count = completed.length
  if (count === 0) return null

  const names = completed.map(c => c.name)
  const preview = names.join(' · ')

  // A focused completed stop must stay viewable: force the panel open so its card
  // shows even if the user has the section collapsed.
  const focusedIsCompleted = completed.some(c => c.index === focusedStopIndex)
  const open = expanded || focusedIsCompleted

  return (
    <section aria-labelledby={`${panelId}-h`} className="mb-3">
      <h3 id={`${panelId}-h`} className="m-0">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="w-full flex items-center gap-2.5 min-h-[44px] px-2.5 rounded-[12px] border border-hair bg-fill/60 text-left transition-colors hover:bg-fill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link"
        >
          <span
            className="flex-none grid place-items-center w-[17px] h-[17px] rounded-full bg-sig-btn/[0.16] border border-sig-btn/[0.45] text-sig-link"
            aria-hidden="true"
          >
            <Check size={10} strokeWidth={3} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[12.5px] font-medium text-ink/80">
              {count} Stop{count === 1 ? '' : 's'} Complete
            </span>
            {preview && (
              <span className="block truncate text-[11.5px] text-muted/80 leading-snug">{preview}</span>
            )}
          </span>
          <ChevronRight
            size={16}
            aria-hidden="true"
            className={'flex-none text-muted transition-transform duration-200 motion-reduce:transition-none ' + (open ? 'rotate-90' : '')}
          />
        </button>
      </h3>

      {open && (
        <div id={panelId} className="mt-1.5 pl-1 space-y-1.5">
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
      )}
    </section>
  )
}

export default CompletedSection
