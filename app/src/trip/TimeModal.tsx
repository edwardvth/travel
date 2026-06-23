import { useEffect, useRef } from 'react'
import { motion, MotionConfig } from 'framer-motion'
import { Clock, Minus, Plus } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { TimeWheelPicker } from './TimeWheelPicker'
import { nudgeTime, toInputTime } from './time'
import { cn } from '../lib/utils'

/** Quick-nudge increments, in minutes. */
const NUDGES = [-30, -15, 15, 30] as const
const TITLE_ID = 'time-modal-title'
const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

/**
 * Mobile time-edit surface: a **floating** centred card (not docked to an edge)
 * over a dimmed-but-visible backdrop, with a fade + pop-in animation. Holds the
 * 3D wheel picker, the −30/−15/+15/+30 nudge chips, and clear/done. Autosaves;
 * Esc / backdrop close it; focus is trapped + restored. The parent wraps this in
 * `AnimatePresence` so it also animates out. Respects `prefers-reduced-motion`.
 */
export function TimeModal({
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
  const cardRef = useRef<HTMLDivElement>(null)
  const hasTime = toInputTime(value) !== ''

  // Focus into the card on open; Esc closes; Tab cycles within; restore on close.
  useEffect(() => {
    const card = cardRef.current
    const previouslyFocused = document.activeElement as HTMLElement | null
    const focusable = () =>
      Array.from(card?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter((el) => el.offsetParent !== null)
    ;(focusable()[0] ?? card)?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const items = focusable()
      if (items.length === 0) {
        e.preventDefault()
        card?.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey) {
        if (active === first || !card?.contains(active)) {
          e.preventDefault()
          last.focus()
        }
      } else if (active === last || !card?.contains(active)) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      previouslyFocused?.focus?.()
    }
  }, [onClose])

  return (
    <MotionConfig reducedMotion="user">
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
      >
        {/* Dimmed-but-visible backdrop (page still shows beneath). */}
        <motion.div
          className="absolute inset-0 bg-black/50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
        />

        {/* Floating card — fade + pop-in. */}
        <motion.div
          ref={cardRef}
          tabIndex={-1}
          className="relative w-[300px] max-w-[calc(100vw-2rem)] rounded-card border border-hair bg-overlay p-5 shadow-lift focus-visible:outline-none"
          initial={{ opacity: 0, scale: 0.94, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ type: 'spring', stiffness: 360, damping: 28 }}
        >
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
        </motion.div>
      </div>
    </MotionConfig>
  )
}

export default TimeModal
