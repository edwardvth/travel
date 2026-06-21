import { Check, ChevronRight } from 'lucide-react'

/**
 * The Guide progress header from the Premium Modern reference: a mono
 * `STOP n OF m` line, a segmented bar (one segment per stop, filled
 * claret up to the current stop, the current segment breathing via `vySeg`), and
 * a quiet "n complete · names" line beneath. Pure presentation.
 *
 * The day label now lives in `DayNav` (Guide v2 §4), which sits above this header.
 *
 * `stopNumber` is 1-based (the current stop's position); `completedCount` and
 * `completedNames` describe the stops already done on this day.
 *
 * Completion is non-linear (stops can be done out of order and un-done), so the
 * segmented bar fills per-stop from `completedIndices` when provided (each done
 * stop's segment is claret); the *current* stop's segment breathes. Without it we
 * fall back to the legacy positional fill (everything up to `stopNumber`).
 */
export function GuideProgress({
  stopNumber,
  stopCount,
  completedCount,
  completedNames,
  completedIndices,
  completedExpanded,
  onToggleCompleted,
  completedPanelId,
}: {
  stopNumber: number
  stopCount: number
  completedCount: number
  completedNames: string[]
  /** 0-based indices of completed stops on this day; enables per-stop fill. */
  completedIndices?: number[]
  /** Whether the Completed Stops section is open (drives the chevron + aria). */
  completedExpanded?: boolean
  /** When provided, the "n complete" line becomes the disclosure toggle. */
  onToggleCompleted?: () => void
  /** id of the completed-stops panel this toggle controls (aria-controls). */
  completedPanelId?: string
}) {
  const segments = Array.from({ length: Math.max(stopCount, 0) })
  const doneSet = completedIndices ? new Set(completedIndices) : null

  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <span className="font-mono text-[10.5px] tracking-[0.12em] text-muted">
          STOP {stopNumber} OF {stopCount}
        </span>
      </div>

      <div className="flex gap-1 mb-3.5" aria-hidden="true">
        {segments.map((_, i) => {
          const done = doneSet ? doneSet.has(i) : i < stopNumber - 1
          const current = i === stopNumber - 1 && !(doneSet?.has(i))
          return (
            <div
              key={i}
              className={
                'flex-1 h-[3px] rounded-[2px] ' +
                (done || current ? 'bg-sig-btn' : 'bg-ink/[0.12]')
              }
              style={current ? { animation: 'vySeg 1.8s ease-in-out infinite' } : undefined}
            />
          )
        })}
      </div>

      {completedCount > 0 && (() => {
        const checkEl = (
          <span
            className="flex-none grid place-items-center w-[17px] h-[17px] rounded-full bg-sig-btn/[0.16] border border-sig-btn/[0.45] text-sig-link"
            aria-hidden="true"
          >
            <Check size={10} strokeWidth={3} />
          </span>
        )
        const label = (
          <span className="min-w-0 flex-1 truncate text-left">
            {completedCount} stop{completedCount === 1 ? '' : 's'} complete
            {completedNames.length > 0 && ` · ${completedNames.join(', ')}`}
          </span>
        )
        // With a toggle, the quiet "n complete" line becomes the disclosure
        // trigger — same style, plus a rotating chevron (matches DayNav/Manage).
        return onToggleCompleted ? (
          <button
            type="button"
            onClick={onToggleCompleted}
            aria-expanded={!!completedExpanded}
            aria-controls={completedPanelId}
            className="w-full flex items-center gap-2.5 min-h-[44px] -mx-1 px-1 rounded-[10px] text-muted text-[12.5px] transition-colors hover:text-ink/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link"
          >
            {checkEl}
            {label}
            <ChevronRight
              size={16}
              aria-hidden="true"
              className={'flex-none transition-transform duration-200 motion-reduce:transition-none ' + (completedExpanded ? 'rotate-90' : '')}
            />
          </button>
        ) : (
          <div className="flex items-center gap-2.5 pt-1 pb-3 text-muted text-[12.5px]">
            {checkEl}
            {label}
          </div>
        )
      })()}
    </div>
  )
}

export default GuideProgress
