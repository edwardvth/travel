import { Clock, Minus, Plus } from 'lucide-react'
import { Sheet } from '../components/ui/Sheet'
import { Button } from '../components/ui/Button'
import { TimeWheelPicker } from './TimeWheelPicker'
import { nudgeTime, toInputTime } from './time'
import { cn } from '../lib/utils'

/** Quick-nudge increments, in minutes. */
const NUDGES = [-30, -15, 15, 30] as const
const TITLE_ID = 'time-sheet-title'

/**
 * Mobile time-edit surface: a bottom sheet (full-width — never runs off-page)
 * with the 3D wheel picker, the −30/−15/+15/+30 nudge chips, and clear/done.
 * Autosaves on every change; the Sheet handles focus-trap + Esc + backdrop.
 */
export function TimeSheet({
  value,
  onChange,
  onClear,
  onClose,
}: {
  value: string | undefined
  onChange: (time: string | undefined) => void
  onClear: () => void
  onClose: () => void
}) {
  const hasTime = toInputTime(value) !== ''
  return (
    <Sheet open onClose={onClose} labelledBy={TITLE_ID}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 id={TITLE_ID} className="inline-flex items-center gap-2 font-serif text-xl">
          <Clock size={18} aria-hidden="true" />
          Adjust time
        </h2>
        <span className="font-mono text-[15px] tabular-nums text-muted">{value ?? '—'}</span>
      </div>

      <TimeWheelPicker value={value ?? '9:00 AM'} onChange={onChange} />

      <div className="mt-5 grid grid-cols-4 gap-2" role="group" aria-label="Nudge time">
        {NUDGES.map((delta) => (
          <button
            key={delta}
            type="button"
            disabled={!hasTime}
            onClick={() => onChange(nudgeTime(value, delta))}
            aria-label={`${delta > 0 ? 'Add' : 'Subtract'} ${Math.abs(delta)} minutes`}
            className={cn(
              'inline-flex min-h-[44px] items-center justify-center gap-0.5 rounded-btn font-mono text-[13px] font-bold tabular-nums',
              'bg-fill text-ink transition-colors duration-150 motion-reduce:transition-none',
              'hover:bg-fill-hover active:bg-sig-btn/15',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link',
              'disabled:pointer-events-none disabled:opacity-40',
            )}
          >
            {delta > 0 ? <Plus size={12} aria-hidden="true" /> : <Minus size={12} aria-hidden="true" />}
            {Math.abs(delta)}
          </button>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between gap-3">
        {hasTime ? (
          <button
            type="button"
            onClick={() => {
              onClear()
              onClose()
            }}
            className="rounded-md px-1 py-1.5 text-[13px] font-bold text-muted transition-colors hover:text-sig focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link"
          >
            Clear time
          </button>
        ) : (
          <span />
        )}
        <Button variant="claret" onClick={onClose}>
          Done
        </Button>
      </div>
    </Sheet>
  )
}

export default TimeSheet
