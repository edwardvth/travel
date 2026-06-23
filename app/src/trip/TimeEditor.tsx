import { useEffect, useRef } from 'react'
import { Clock, Minus, Plus, RotateCcw, X } from 'lucide-react'
import { toInputTime, fromInputTime, nudgeTime } from './time'
import { cn } from '../lib/utils'

const NUDGES = [-30, -15, 15, 30] as const

/**
 * Compact inline time editor, anchored under a stop row's time pill. A native
 * time field (exact set) plus −15 / −5 / +5 / +15 nudge chips for quick
 * adjustments, plus a clear action. Presentational + autosaving: every change
 * calls `onChange` immediately; the parent owns open/close (Esc + outside-click)
 * and the immutable save. lucide icons, token theming, ≥40px tap targets,
 * `prefers-reduced-motion` friendly (colour-only feedback, no layout shift).
 */
export function TimeEditor({
  value,
  onChange,
  onClear,
  onClose,
  suggested,
}: {
  value: string | undefined
  onChange: (time: string | undefined) => void
  onClear: () => void
  onClose: () => void
  /** The AI-suggested time, if any — enables a "back to suggested" reset. */
  suggested?: string
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const hasTime = toInputTime(value) !== ''
  const canReset = !!suggested && suggested !== value

  // Focus the exact-time field when the editor opens.
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <div
      role="dialog"
      aria-label="Adjust time"
      // Keep clicks inside the card from bubbling to the row's select handler.
      onClick={(e) => e.stopPropagation()}
      className="absolute left-0 top-full z-20 mt-1.5 w-[244px] rounded-card border border-hair bg-base p-3 shadow-card"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
          <Clock size={12} aria-hidden="true" />
          Adjust time
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close time editor"
          className="grid h-7 w-7 place-items-center rounded-md text-muted transition-colors hover:bg-fill hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link"
        >
          <X size={15} aria-hidden="true" />
        </button>
      </div>

      <label htmlFor="time-editor-field" className="sr-only">
        Exact time
      </label>
      <input
        id="time-editor-field"
        ref={inputRef}
        type="time"
        value={toInputTime(value)}
        onChange={(e) => onChange(fromInputTime(e.target.value))}
        className="w-full rounded-btn border border-hair bg-fill px-3 py-2.5 font-mono text-[15px] text-ink outline-none focus:border-sig-link"
      />

      <div className="mt-2.5 grid grid-cols-4 gap-2" role="group" aria-label="Nudge time">
        {NUDGES.map((delta) => (
          <button
            key={delta}
            type="button"
            disabled={!hasTime}
            onClick={() => onChange(nudgeTime(value, delta))}
            aria-label={`${delta > 0 ? 'Add' : 'Subtract'} ${Math.abs(delta)} minutes`}
            className={cn(
              'inline-flex min-h-[40px] items-center justify-center gap-0.5 rounded-btn font-mono text-[13px] font-bold tabular-nums tracking-tight',
              'bg-fill text-ink transition-colors duration-150 motion-reduce:transition-none',
              'hover:bg-fill-hover active:bg-sig-btn/15',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link',
              'disabled:pointer-events-none disabled:opacity-40',
            )}
          >
            {delta > 0 ? <Plus size={11} aria-hidden="true" /> : <Minus size={11} aria-hidden="true" />}
            {Math.abs(delta)}
          </button>
        ))}
      </div>

      {canReset && (
        <button
          type="button"
          onClick={() => onChange(suggested)}
          className="mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-btn bg-fill py-2 font-mono text-[12px] font-bold tabular-nums text-sig-link transition-colors hover:bg-fill-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link"
        >
          <RotateCcw size={12} aria-hidden="true" />
          Reset to {suggested}
        </button>
      )}

      {hasTime && (
        <button
          type="button"
          onClick={() => {
            onClear()
            onClose()
          }}
          className="mt-2.5 w-full rounded-md py-1.5 text-[12.5px] font-bold text-muted transition-colors hover:text-sig focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link"
        >
          Clear time
        </button>
      )}
    </div>
  )
}

export default TimeEditor
