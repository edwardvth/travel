import { useEffect, useId, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays, Plus, Check } from '../icons'
import { dayNavModel } from './guide-helpers'

/**
 * The Guide's day navigator (Guide v2 §4): a wheel-picker-style header that
 * replaces the static day label. The active date sits centred and tappable
 * (opens a lightweight day-picker popover listing every trip day); lucide
 * Chevron buttons flank it, each with a faded neighbour label. At a boundary the
 * missing neighbour is replaced by an **Add Day** affordance (edit-gated) that
 * extends the trip — wired to `onAddDay` (handled in the orchestrator).
 *
 * Pure presentation over `dayNavModel(...)`; all mutations flow up through the
 * callbacks. Anti-slop: lucide-only icons, token classes, ≥44px targets, aria
 * labels, light + dark, no layout shift.
 */
export function DayNav({
  dayIndex,
  dayCount,
  dayLabels,
  onPrev,
  onNext,
  onPickDay,
  onAddDay,
  canEdit,
}: {
  dayIndex: number
  dayCount: number
  dayLabels: string[] | undefined
  onPrev: () => void
  onNext: () => void
  onPickDay: (i: number) => void
  onAddDay: (side: 'before' | 'after') => void
  canEdit: boolean
}) {
  const { prevLabel, activeLabel, nextLabel, atStart, atEnd } = dayNavModel(dayIndex, dayCount, dayLabels)
  const [pickerOpen, setPickerOpen] = useState(false)
  const labelAt = (i: number): string => dayLabels?.[i] || `Day ${i + 1}`

  return (
    <div className="relative mb-2.5">
      <div className="flex items-center justify-between gap-2">
        {/* Left: previous day, or Add Day at the start boundary. */}
        {atStart ? (
          <AddDaySlot canEdit={canEdit} onAddDay={() => onAddDay('before')} align="start" />
        ) : (
          <button
            type="button"
            onClick={onPrev}
            aria-label="Previous day"
            className="group flex min-h-[44px] items-center gap-1.5 rounded-[10px] px-1.5 -mx-1.5 text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig/40"
          >
            <ChevronLeft size={18} className="flex-none" aria-hidden="true" />
            <span className="font-mono text-[10.5px] tracking-[0.08em] opacity-50 transition-opacity group-hover:opacity-80">
              {prevLabel}
            </span>
          </button>
        )}

        {/* Centre: the active date — tappable to open the day picker. */}
        <button
          type="button"
          onClick={() => setPickerOpen(o => !o)}
          aria-label="Pick a day"
          aria-haspopup="dialog"
          aria-expanded={pickerOpen}
          className="flex min-h-[44px] items-center gap-1.5 rounded-[10px] px-2.5 text-ink transition-colors hover:bg-fill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig/40"
        >
          <CalendarDays size={14} className="flex-none text-sig-link" aria-hidden="true" />
          <span className="font-mono text-[12.5px] tracking-[0.04em] text-sig-link">{activeLabel}</span>
        </button>

        {/* Right: next day, or Add Day at the end boundary. */}
        {atEnd ? (
          <AddDaySlot canEdit={canEdit} onAddDay={() => onAddDay('after')} align="end" />
        ) : (
          <button
            type="button"
            onClick={onNext}
            aria-label="Next day"
            className="group flex min-h-[44px] items-center gap-1.5 rounded-[10px] px-1.5 -mx-1.5 text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig/40"
          >
            <span className="font-mono text-[10.5px] tracking-[0.08em] opacity-50 transition-opacity group-hover:opacity-80">
              {nextLabel}
            </span>
            <ChevronRight size={18} className="flex-none" aria-hidden="true" />
          </button>
        )}
      </div>

      {pickerOpen && (
        <DayPicker
          dayIndex={dayIndex}
          dayCount={dayCount}
          labelAt={labelAt}
          onPick={i => {
            onPickDay(i)
            setPickerOpen(false)
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}

/**
 * The boundary Add-Day affordance. Hidden entirely (rendered as an inert spacer
 * to avoid layout shift) when the viewer can't edit. `align` keeps the centre
 * date optically centred by reserving the same footprint as a neighbour button.
 */
function AddDaySlot({
  canEdit,
  onAddDay,
  align,
}: {
  canEdit: boolean
  onAddDay: () => void
  align: 'start' | 'end'
}) {
  if (!canEdit) return <span aria-hidden="true" className="min-h-[44px] w-9 flex-none" />
  return (
    <button
      type="button"
      onClick={onAddDay}
      aria-label="Add a day"
      className={
        'group flex min-h-[44px] items-center gap-1.5 rounded-[10px] px-1.5 text-muted transition-colors hover:text-sig-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig/40 ' +
        (align === 'start' ? '-ml-1.5' : '-mr-1.5')
      }
    >
      {align === 'start' && <Plus size={16} className="flex-none" aria-hidden="true" />}
      <span className="font-mono text-[10.5px] tracking-[0.08em] opacity-60 transition-opacity group-hover:opacity-100">
        Add Day
      </span>
      {align === 'end' && <Plus size={16} className="flex-none" aria-hidden="true" />}
    </button>
  )
}

/**
 * A lightweight day-picker popover anchored under the active date. Lists every
 * trip day with its date label; selecting one calls `onPick(i)`. Closes on
 * Escape or an outside click. Focuses the active day on open.
 */
function DayPicker({
  dayIndex,
  dayCount,
  labelAt,
  onPick,
  onClose,
}: {
  dayIndex: number
  dayCount: number
  labelAt: (i: number) => string
  onPick: (i: number) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    // Focus the active day on open.
    ref.current?.querySelector<HTMLElement>('[data-active="true"]')?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    window.addEventListener('keydown', onKey)
    // Defer so the opening click doesn't immediately close it.
    const id = window.setTimeout(() => window.addEventListener('pointerdown', onPointer), 0)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.clearTimeout(id)
      window.removeEventListener('pointerdown', onPointer)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      className="absolute left-1/2 top-full z-40 mt-2 w-[min(18rem,calc(100vw-2.5rem))] -translate-x-1/2 rounded-card border border-hair bg-overlay p-1.5 shadow-lift"
    >
      <p id={titleId} className="px-2.5 pt-1.5 pb-1 font-mono text-[10px] tracking-[0.12em] text-muted">
        JUMP TO DAY
      </p>
      <ul className="max-h-[50vh] overflow-y-auto">
        {Array.from({ length: Math.max(dayCount, 0) }).map((_, i) => {
          const active = i === dayIndex
          return (
            <li key={i}>
              <button
                type="button"
                data-active={active}
                onClick={() => onPick(i)}
                aria-current={active ? 'true' : undefined}
                className={
                  'flex min-h-[44px] w-full items-center gap-2.5 rounded-[10px] px-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig/40 ' +
                  (active ? 'bg-fill text-ink' : 'text-ink/80 hover:bg-fill')
                }
              >
                <span className="font-mono text-[10px] tracking-[0.08em] text-muted">DAY {i + 1}</span>
                <span className="min-w-0 truncate text-[14px]">{labelAt(i)}</span>
                {active && <Check size={14} strokeWidth={3} className="ml-auto flex-none text-sig-link" aria-hidden="true" />}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default DayNav
