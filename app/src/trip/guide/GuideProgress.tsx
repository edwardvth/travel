import { Check } from 'lucide-react'

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
}: {
  stopNumber: number
  stopCount: number
  completedCount: number
  completedNames: string[]
  /** 0-based indices of completed stops on this day; enables per-stop fill. */
  completedIndices?: number[]
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

      {completedCount > 0 && (
        <div className="flex items-center gap-2.5 pt-1 pb-3 text-muted text-[12.5px]">
          <span
            className="flex-none grid place-items-center w-[17px] h-[17px] rounded-full bg-sig-btn/[0.16] border border-sig-btn/[0.45] text-sig-link"
            aria-hidden="true"
          >
            <Check size={10} strokeWidth={3} />
          </span>
          <span className="min-w-0 truncate">
            {completedCount} stop{completedCount === 1 ? '' : 's'} complete
            {completedNames.length > 0 && ` · ${completedNames.join(', ')}`}
          </span>
        </div>
      )}
    </div>
  )
}

export default GuideProgress
