import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  monthGrid, applyRangeClick, inBand, isStart, isEnd, addMonths, monthLabel,
  parseISO, type DateRange, type YM,
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

export function RangeCalendar({ value, onChange, onComplete, onSkip, initialMonth }: RangeCalendarProps) {
  const [month, setMonth] = useState<YM>(() =>
    initialMonth ?? (value.start ? ymOf(value.start) : ymToday()))
  const cells = useMemo(() => monthGrid(month.y, month.m), [month])

  const pick = (iso: string) => {
    const next = applyRangeClick(value, iso)
    onChange(next)
    if (next.start && next.end) onComplete?.(next)
  }

  return (
    <div
      role="dialog"
      aria-label="Choose your dates"
      className={cn(
        'w-[300px] max-w-[calc(100vw-2rem)] rounded-2xl p-3.5',
        'border border-white/12 bg-[rgba(16,14,20,.92)] backdrop-blur-xl',
        'shadow-[0_18px_50px_rgba(0,0,0,.5)]',
      )}
    >
      <div className="flex items-center justify-between mb-2.5">
        <button type="button" aria-label="Previous month" onClick={() => setMonth(m => addMonths(m, -1))}
          className="grid place-items-center size-9 rounded-lg text-white/70 hover:bg-white/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50">
          <ChevronLeft size={18} />
        </button>
        <span className="font-serif text-[14px] text-white">{monthLabel(month)}</span>
        <button type="button" aria-label="Next month" onClick={() => setMonth(m => addMonths(m, 1))}
          className="grid place-items-center size-9 rounded-lg text-white/70 hover:bg-white/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50">
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 mb-1 text-center text-[10px] text-white/40">
        {DOW.map((d, i) => <span key={i}>{d}</span>)}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {cells.map(c => {
          const start = isStart(value, c.iso), end = isEnd(value, c.iso), band = inBand(value, c.iso)
          return (
            <button
              key={c.iso}
              type="button"
              onClick={() => pick(c.iso)}
              aria-label={c.iso}
              aria-selected={start || end}
              className={cn(
                'h-9 text-[12.5px] grid place-items-center transition-colors',
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

      <button
        type="button"
        onClick={onSkip}
        className="mt-3 w-full h-10 rounded-xl text-[13px] text-white/70 border border-white/14 hover:bg-white/6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
      >
        Don't know dates yet
      </button>
    </div>
  )
}

function ymOf(iso: string): YM { const { y, m } = parseISO(iso); return { y, m } }
function ymToday(): YM { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() } }

export default RangeCalendar
