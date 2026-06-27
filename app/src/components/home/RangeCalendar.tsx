import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  monthGrid, applyRangeClick, inBand, isStart, isEnd, addMonths, addDays, monthLabel,
  parseISO, isoOf, type DateRange, type DayCell, type YM,
} from '../../lib/range-calendar'
import { cn } from '../../lib/utils'

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export interface RangeCalendarProps {
  value: DateRange
  onChange: (next: DateRange) => void
  /** Fired when the user completes a range (2nd click). */
  onComplete?: (range: DateRange) => void
  /** "Don't know dates yet". */
  onSkip: () => void
  /** Month initially shown; defaults to today's month or the current start. */
  initialMonth?: YM
}

/** Human, screen-reader-friendly label for a day (display only, never stored). */
function humanLabel(iso: string): string {
  const { y, m, d } = parseISO(iso)
  return new Date(y, m, d, 12).toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}

export function RangeCalendar({ value, onChange, onComplete, onSkip, initialMonth }: RangeCalendarProps) {
  const [month, setMonth] = useState<YM>(() =>
    initialMonth ?? (value.start ? ymOf(value.start) : ymToday()))
  const [focusIso, setFocusIso] = useState<string>(() =>
    value.start ?? isoOf({ ...(initialMonth ?? ymToday()), d: 1 }))

  const cells = useMemo(() => monthGrid(month.y, month.m), [month])
  const weeks = useMemo(() => {
    const out: DayCell[][] = []
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7))
    return out
  }, [cells])

  const dayRefs = useRef(new Map<string, HTMLButtonElement>())
  const navigating = useRef(false)

  // After a keyboard move (and any resulting month switch), pull DOM focus to the new day.
  useEffect(() => {
    if (!navigating.current) return
    navigating.current = false
    dayRefs.current.get(focusIso)?.focus()
  }, [focusIso, month])

  const pick = (iso: string) => {
    const next = applyRangeClick(value, iso)
    onChange(next)
    if (next.start && next.end) onComplete?.(next)
  }

  const goMonth = (delta: number) => {
    const nm = addMonths(month, delta)
    setMonth(nm)
    setFocusIso(isoOf({ ...nm, d: 1 })) // keep the roving tabindex valid; don't steal focus
  }

  const moveFocus = (iso: string) => {
    navigating.current = true
    setFocusIso(iso)
    const nm = ymOf(iso)
    if (nm.y !== month.y || nm.m !== month.m) setMonth(nm)
  }

  const onDayKey = (e: React.KeyboardEvent, iso: string) => {
    switch (e.key) {
      case 'ArrowLeft': e.preventDefault(); moveFocus(addDays(iso, -1)); break
      case 'ArrowRight': e.preventDefault(); moveFocus(addDays(iso, 1)); break
      case 'ArrowUp': e.preventDefault(); moveFocus(addDays(iso, -7)); break
      case 'ArrowDown': e.preventDefault(); moveFocus(addDays(iso, 7)); break
      case 'Home': e.preventDefault(); moveFocus(addDays(iso, -weekday(iso))); break
      case 'End': e.preventDefault(); moveFocus(addDays(iso, 6 - weekday(iso))); break
      case 'Enter': case ' ': e.preventDefault(); pick(iso); break
    }
  }

  return (
    <div
      role="dialog"
      aria-label="Choose your dates"
      className={cn(
        'w-[336px] max-w-[calc(100vw-2rem)] rounded-2xl p-3.5',
        'border border-white/12 bg-[rgba(16,14,20,.92)] backdrop-blur-xl',
        'shadow-[0_18px_50px_rgba(0,0,0,.5)]',
      )}
    >
      <div className="flex items-center justify-between mb-2.5">
        <button type="button" aria-label="Previous month" onClick={() => goMonth(-1)}
          className="grid place-items-center size-11 rounded-lg text-white/70 hover:bg-white/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50">
          <ChevronLeft size={18} />
        </button>
        <span className="font-serif text-[14px] text-white" aria-live="polite">{monthLabel(month)}</span>
        <button type="button" aria-label="Next month" onClick={() => goMonth(1)}
          className="grid place-items-center size-11 rounded-lg text-white/70 hover:bg-white/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50">
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 mb-1 text-center text-[10px] text-white/40" aria-hidden="true">
        {DOW.map((d, i) => <span key={i}>{d}</span>)}
      </div>

      <div role="grid" aria-label={monthLabel(month)}>
        {weeks.map((week, wi) => (
          <div role="row" key={wi} className="grid grid-cols-7 gap-0.5">
            {week.map(c => {
              const start = isStart(value, c.iso), end = isEnd(value, c.iso), band = inBand(value, c.iso)
              return (
                <button
                  key={c.iso}
                  ref={el => { if (el) dayRefs.current.set(c.iso, el); else dayRefs.current.delete(c.iso) }}
                  type="button"
                  role="gridcell"
                  tabIndex={c.iso === focusIso ? 0 : -1}
                  onClick={() => pick(c.iso)}
                  onKeyDown={e => onDayKey(e, c.iso)}
                  aria-label={humanLabel(c.iso)}
                  aria-selected={start || end || undefined}
                  className={cn(
                    'h-11 text-[12.5px] grid place-items-center transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60',
                    c.inMonth ? 'text-white/85' : 'text-white/25',
                    band && 'bg-[rgba(125,34,48,.22)]',
                    start && 'rounded-l-lg bg-sig text-white',
                    end && 'rounded-r-lg bg-sig text-white',
                    !start && !end && 'rounded-lg hover:bg-[rgba(201,162,75,.18)]',
                  )}
                >
                  {c.day}
                </button>
              )
            })}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onSkip}
        className="mt-3 w-full h-11 rounded-xl text-[13px] text-white/70 border border-white/14 hover:bg-white/6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
      >
        Don't know dates yet
      </button>
    </div>
  )
}

function weekday(iso: string): number {
  const { y, m, d } = parseISO(iso)
  return new Date(y, m, d, 12).getDay()
}
function ymOf(iso: string): YM { const { y, m } = parseISO(iso); return { y, m } }
function ymToday(): YM { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() } }

export default RangeCalendar
