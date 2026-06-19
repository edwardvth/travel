import { useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import type { PlannerOutletContext } from './PlannerLayout'
import { dayCount, dayLabel } from './helpers'
import { cn } from '../lib/utils'
import TripMapView, { type MapScope, type MapSelection } from './TripMapView'

/** Distinct, readable hue per day index (mirrors the map's color ramp). */
function dayColor(day: number, total: number): string {
  const n = Math.max(total, 1)
  return `hsl(${Math.round((day * 360) / n)}, 65%, 48%)`
}

/**
 * Fullscreen, all-days map route. A thin wrapper around the shared
 * `TripMapView` plus a day selector (scope = selected day or 'all').
 */
export default function TripMap() {
  const { trip } = useOutletContext<PlannerOutletContext>()
  const navigate = useNavigate()

  const [scope, setScope] = useState<MapScope>('all')

  const totalDays = dayCount(trip)
  const dayChips = Array.from({ length: totalDays }, (_, i) => i)

  function handleOpen(sel: MapSelection) {
    navigate(`/trip/${trip.id}/stop/${sel.day}/${sel.n}`)
  }

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] min-h-[420px]">
      {/* Day selector */}
      <div className="px-4 md:px-8 py-3 border-b border-hair">
        <div className="flex items-center gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Map day">
          <button
            type="button"
            role="tab"
            aria-selected={scope === 'all'}
            onClick={() => setScope('all')}
            className={cn(
              'shrink-0 px-3.5 py-2 rounded-btn text-[13px] font-bold transition-colors min-h-[40px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link',
              scope === 'all' ? 'bg-sig-btn text-white' : 'bg-fill text-muted hover:text-ink',
            )}
          >
            All days
          </button>
          {dayChips.map((d) => (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={scope === d}
              onClick={() => setScope(d)}
              className={cn(
                'shrink-0 inline-flex items-center gap-2 px-3.5 py-2 rounded-btn text-[13px] font-bold transition-colors min-h-[40px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link',
                scope === d ? 'bg-sig-btn text-white' : 'bg-fill text-muted hover:text-ink',
              )}
            >
              <span
                aria-hidden="true"
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ background: dayColor(d, totalDays) }}
              />
              {dayLabel(trip, d)}
            </button>
          ))}
        </div>
      </div>

      {/* Map area */}
      <TripMapView trip={trip} scope={scope} onOpen={handleOpen} className="flex-1" />
    </div>
  )
}
