import { useEffect, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import type { PlannerOutletContext } from './PlannerLayout'
import { DayRail } from './DayRail'
import { StopList } from './StopList'
import { AddStop } from './AddStop'
import TripMapView, { type MapSelection } from './TripMapView'
import { suggestDay } from './suggest'
import { dayCount as countDays, dayLabel, stopCount } from './helpers'
import { WeatherGlance } from './WeatherGlance'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/EmptyState'
import { Plus, Sparkles } from 'lucide-react'
import { cn } from '../lib/utils'
import type { TripData } from '../types'

export default function Itinerary() {
  // Day selection is lifted into the layout (mirrored to `?day=N`) so the
  // desktop sidebar and these mobile day chips share one source of truth.
  const { trip, canEdit, save, activeDay, setActiveDay } = useOutletContext<PlannerOutletContext>()
  const navigate = useNavigate()
  const [selected, setSelected] = useState<MapSelection | null>(null)
  const [adding, setAdding] = useState(false)
  const [suggestingDay, setSuggestingDay] = useState(false)
  const [suggestError, setSuggestError] = useState<string | null>(null)

  const day = Math.min(activeDay, Math.max(0, countDays(trip) - 1))
  const count = stopCount(trip, day)

  // Clear any stale selection when switching days.
  useEffect(() => {
    setSelected((s) => (s && s.day === day ? s : null))
  }, [day])

  function handleSelectDay(next: number) {
    setActiveDay(next)
    setSelected(null)
  }

  /** Row body / marker click → select + focus map on this stop. */
  function handleSelectStop(index: number) {
    setSelected({ day, n: index })
  }

  /** Marker click from the map → select that stop (and follow the day if needed). */
  function handleMapSelect(sel: MapSelection) {
    if (sel.day !== day) setActiveDay(sel.day)
    setSelected(sel)
  }

  /** Explicit "open detail" affordance → navigate to the stop page. */
  function handleOpenStop(sel: MapSelection) {
    navigate(`/trip/${trip.id}/stop/${sel.day}/${sel.n}`)
  }

  async function handleSuggestDay() {
    if (!canEdit || suggestingDay) return
    setSuggestingDay(true)
    setSuggestError(null)
    try {
      const stops = await suggestDay({ tripTitle: trip.title })
      if (!stops.length) {
        setSuggestError('I couldn’t shape a day just now — try adding a stop yourself, or give it another go.')
        return
      }
      const data = trip.data
      const next: TripData = {
        ...data,
        days: data.days.map((d, i) => (i === day ? { ...d, stops: [...d.stops, ...stops] } : d)),
      }
      save({ data: next })
    } catch (e) {
      setSuggestError(
        e instanceof Error
          ? `I couldn’t shape a day just now — ${e.message}`
          : 'I couldn’t shape a day just now. Give it another go in a moment.',
      )
    } finally {
      setSuggestingDay(false)
    }
  }

  const addStopButton = (
    <Button variant="claret" onClick={() => setAdding(true)}>
      <Plus size={16} aria-hidden="true" />
      Add a stop
    </Button>
  )

  return (
    // One responsive split: column on mobile (map on top), row on desktop (list left,
    // map right). `min-h-0` lets the desktop LEFT column scroll independently while the
    // map fills its column. `flex-1` makes this fill the height handed down by the layout.
    <div className="flex-1 min-h-0 flex flex-col md:flex-row md:items-stretch">
      {/* SINGLE map instance — reflows responsively (no second hidden copy).
          Mobile: pinned to the top, ~40dvh. Desktop: the right column, full height. */}
      <div
        className={cn(
          'order-first md:order-none',
          'sticky top-0 z-10 md:static',
          'h-[40dvh] min-h-[240px] md:h-auto md:min-h-0',
          'md:flex-1 md:basis-[45%] border-b border-hair md:border-b-0 md:border-l md:border-hair',
        )}
      >
        <TripMapView
          trip={trip}
          scope={day}
          selected={selected}
          onSelect={handleMapSelect}
          onOpen={handleOpenStop}
          className="h-full"
        />
      </div>

      {/* LEFT: stop list + add controls. Scrolls independently on desktop.
          Day selection lives in the layout sidebar on desktop; on mobile the
          DayRail chips below drive the same lifted `activeDay`. */}
      <div className="md:basis-[55%] md:max-w-3xl md:overflow-y-auto md:min-h-0 px-5 md:px-8 py-6">
        <div>
          {/* Mobile-only day chips — desktop shows days in the sidebar. */}
          <div className="mb-4 md:hidden">
            <DayRail trip={trip} activeDay={day} onSelect={handleSelectDay} />
          </div>

          <section aria-label={`Stops for ${dayLabel(trip, day)}`}>
            {/* Slim per-day weather glance (Open-Meteo) — graceful when no coords/date. */}
            <WeatherGlance trip={trip} day={day} />
            <div className="flex items-center justify-between gap-3 mb-1">
              <h2 className="font-serif text-2xl">{dayLabel(trip, day)}</h2>
              {canEdit && count > 0 && addStopButton}
            </div>

            {count > 0 ? (
              <StopList
                trip={trip}
                day={day}
                canEdit={canEdit}
                save={save}
                selectedIndex={selected?.day === day ? selected.n : null}
                onSelect={handleSelectStop}
              />
            ) : (
              <>
                <EmptyState
                  title="No stops yet"
                  body={
                    canEdit
                      ? 'Start shaping this day — add a place you want to visit, or let Voyager suggest a full day for you.'
                      : 'This day doesn’t have any stops yet.'
                  }
                  action={
                    canEdit ? (
                      <div className="flex flex-wrap items-center justify-center gap-2.5">
                        {addStopButton}
                        <Button variant="soft" busy={suggestingDay} onClick={handleSuggestDay}>
                          <Sparkles size={16} aria-hidden="true" />
                          Suggest a day for me
                        </Button>
                      </div>
                    ) : undefined
                  }
                />
                {suggestError && (
                  <p className="mx-auto max-w-sm text-center text-[13px] text-sig bg-sig/5 border border-sig/20 rounded-card px-4 py-3">
                    {suggestError}
                  </p>
                )}
              </>
            )}
          </section>
        </div>
      </div>

      {canEdit && (
        <AddStop open={adding} onClose={() => setAdding(false)} trip={trip} day={day} save={save} />
      )}
    </div>
  )
}
