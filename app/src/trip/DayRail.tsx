import { cn } from '../lib/utils'
import { dayLabel, stopCount } from './helpers'
import type { Trip } from '../types'

/**
 * Day selector for the itinerary. Horizontal scroller on mobile, vertical
 * column on desktop. Each chip shows the day label and its stop count; the
 * active day is highlighted in claret.
 */
export function DayRail({ trip, activeDay, onSelect }: {
  trip: Trip
  activeDay: number
  onSelect: (day: number) => void
}) {
  const count = trip.data?.days?.length || trip.config?.numDays || 0
  const days = Array.from({ length: count }, (_, i) => i)

  if (count <= 1) return null

  return (
    <nav
      aria-label="Trip days"
      className={cn(
        'flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none',
        'md:flex-col md:overflow-visible md:mx-0 md:px-0 md:pb-0 md:sticky md:top-4',
      )}
    >
      {days.map(day => {
        const active = day === activeDay
        const n = stopCount(trip, day)
        return (
          <button
            key={day}
            type="button"
            onClick={() => onSelect(day)}
            aria-current={active ? 'true' : undefined}
            className={cn(
              'flex-none md:w-full inline-flex items-center justify-between gap-3 min-h-[44px] px-3.5 rounded-btn',
              'text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link',
              active
                ? 'bg-sig-btn text-white'
                : 'bg-fill text-ink hover:bg-fill-hover',
            )}
          >
            <span className="font-sans font-bold text-[13.5px] whitespace-nowrap">
              {dayLabel(trip, day)}
            </span>
            <span
              className={cn(
                'inline-grid place-items-center min-w-[22px] h-[22px] px-1.5 rounded-full text-[11px] font-bold font-mono',
                active ? 'bg-white/20 text-white' : 'bg-base text-muted',
              )}
            >
              {n}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
