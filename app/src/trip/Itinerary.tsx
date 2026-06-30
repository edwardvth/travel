import { useEffect, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import type { PlannerOutletContext } from './PlannerLayout'
import { DayRail } from './DayRail'
import { StopList } from './StopList'
import { AddStop } from './AddStop'
import TripMapView, { type MapSelection } from './TripMapView'
import { useQueryClient } from '@tanstack/react-query'
import { suggestDay } from './suggest'
import { useLandmarkBackfill } from '../data/useLandmarkBackfill'
import { prefetchStopDescription } from '../data/useStopDescription'
import { destinationOf, stopLandmarkQuery } from './landmark-context'
import { dayCount as countDays, dayLabel, stopCount, isAutoDayTitle } from './helpers'
import { WeatherGlance } from './WeatherGlance'
import { StayCard } from './StayCard'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/EmptyState'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { DaySettingsSheet } from './DaySettingsSheet'
import { addDay, removeDay, reorderDays, setDayMeta } from './day-mutations'
import { dayUtilization } from './day-utilization'
import { moveItem, followDayAfterReorder, followDayAfterDelete } from './itinerary-helpers'
import { Plus, Pencil, Sparkles, Trash2, CalendarPlus, TriangleAlert } from 'lucide-react'
import { cn } from '../lib/utils'
import type { TripData } from '../types'

export default function Itinerary() {
  // Day selection is lifted into the layout (mirrored to `?day=N`) so the
  // desktop sidebar and these mobile day chips share one source of truth.
  const { trip, canEdit, save, activeDay, setActiveDay } = useOutletContext<PlannerOutletContext>()
  const { backfillStop } = useLandmarkBackfill(trip.id, save)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [selected, setSelected] = useState<MapSelection | null>(null)
  const [adding, setAdding] = useState(false)
  const [suggestingDay, setSuggestingDay] = useState(false)
  const [suggestError, setSuggestError] = useState<string | null>(null)
  const [editingDay, setEditingDay] = useState(false)
  const [removingDay, setRemovingDay] = useState(false)
  const [exitingDay, setExitingDay] = useState<number | null>(null)

  const day = Math.min(activeDay, Math.max(0, countDays(trip) - 1))
  const count = stopCount(trip, day)
  const dayObj = trip.data.days?.[day]
  const util = dayUtilization(dayObj?.stops ?? [])
  const dateLabel = dayLabel(trip, day) // "Fri, Jul 4"
  const customTitle = isAutoDayTitle(dayObj?.title) ? '' : (dayObj?.title ?? '').trim()
  const dayTitle = customTitle ? `${customTitle} (${dateLabel})` : dateLabel
  const dayNote = (dayObj?.note || '').trim()

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
      const stops = await suggestDay({
        tripTitle: trip.title,
        near: destinationOf(trip),
        travelerContext:
          typeof trip.config?.travelerContext === 'string' ? trip.config.travelerContext : undefined,
      })
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
      // Fire-and-forget: backfill a landmark photo for each freshly-added stop.
      const dest = destinationOf(trip)
      for (const s of stops) {
        if (!s.image && !(s.photos && s.photos.length)) {
          backfillStop(day, s.name, s.address, stopLandmarkQuery(s.name, dest))
        }
      }
      // Fire-and-forget: warm descriptions for the opening of the day so Guide
      // feels instant when the traveller switches over. Bounded to the first few;
      // deduped + cache-first inside prefetchStopDescription; never blocks here.
      for (const s of stops.slice(0, 3)) {
        prefetchStopDescription(qc, s, { tripTitle: trip.title, destination: dest, enabled: canEdit })
      }
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

  // ── Day management (edit-gated; immutable via `save`; selected day follows) ──
  function handleReorderDays(from: number, to: number) {
    if (!canEdit) return
    const order = moveItem(trip.data.days.map((_, i) => i), from, to)
    save({ data: reorderDays(trip.data, from, to) })
    setActiveDay(followDayAfterReorder(day, order))
  }
  function handleAddDay() {
    if (!canEdit) return
    const newIndex = trip.data.days.length // old length = the appended day's index
    save({ data: addDay(trip.data) })
    setActiveDay(newIndex)
  }
  function handleRemoveDay() {
    if (!canEdit) return
    setRemovingDay(false)
    // Collapse the chip first so the deletion is visible, then commit the removal.
    const target = day
    const data = trip.data
    const lastAfter = Math.max(0, countDays(trip) - 2)
    setExitingDay(target)
    window.setTimeout(() => {
      save({ data: removeDay(data, target) })
      setActiveDay(Math.min(followDayAfterDelete(target, target), lastAfter))
      setExitingDay(null)
    }, 230)
  }
  function handleSaveDayMeta(meta: { title: string; note: string }) {
    if (!canEdit) return
    save({ data: setDayMeta(trip.data, day, meta) })
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
            <DayRail
              trip={trip}
              activeDay={day}
              onSelect={handleSelectDay}
              canEdit={canEdit}
              onReorder={handleReorderDays}
              onAddDay={handleAddDay}
              exitingDay={exitingDay}
            />
          </div>

          <section aria-label={`Stops for ${dayLabel(trip, day)}`}>
            {/* Slim per-day weather glance (Open-Meteo) — graceful when no coords/date. */}
            <WeatherGlance trip={trip} day={day} />
            {/* Voyage base Stay — pinned atop every day (data.hotel), inline-editable. */}
            <StayCard trip={trip} canEdit={canEdit} save={save} />
            <div className="flex items-start justify-between gap-3 mb-1">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h2 className="font-serif text-2xl truncate">{dayTitle}</h2>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setEditingDay(true)}
                      aria-label="Edit day title and note"
                      className="flex-none grid place-items-center w-8 h-8 rounded-md text-muted/60 hover:text-ink hover:bg-fill transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link"
                    >
                      <Pencil size={15} aria-hidden="true" />
                    </button>
                  )}
                </div>
                {dayNote && <p className="text-muted text-[13.5px] mt-0.5 break-words">{dayNote}</p>}
                {count > 0 && (
                  <p
                    className={cn(
                      'mt-0.5 inline-flex items-center gap-1 text-[12.5px] font-semibold',
                      util.overloaded ? 'text-amber-700 dark:text-amber-300' : 'text-muted',
                    )}
                  >
                    {util.overloaded && <TriangleAlert size={12} aria-label="This day looks full" />}
                    <span>{util.stops} {util.stops === 1 ? 'stop' : 'stops'} · ~{util.hours}h planned</span>
                  </p>
                )}
              </div>
              <div className="flex-none flex items-center gap-1.5">
                {canEdit && (
                  <button
                    type="button"
                    onClick={handleAddDay}
                    aria-label="Add a day"
                    title="Add a day"
                    className="hidden md:grid place-items-center w-8 h-8 rounded-md text-muted/60 hover:text-ink hover:bg-fill transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link"
                  >
                    <CalendarPlus size={16} aria-hidden="true" />
                  </button>
                )}
                {canEdit && countDays(trip) > 1 && (
                  <button
                    type="button"
                    onClick={() => setRemovingDay(true)}
                    aria-label="Remove this day"
                    className="grid place-items-center w-8 h-8 rounded-md text-muted/60 hover:text-sig hover:bg-fill transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link"
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                )}
                {canEdit && count > 0 && addStopButton}
              </div>
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
                      ? 'Start shaping this day — add a place you want to visit, or let Passage suggest a full day for you.'
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
      {canEdit && (
        <DaySettingsSheet
          open={editingDay}
          title={customTitle}
          note={dayObj?.note ?? ''}
          dateLabel={dateLabel}
          onClose={() => setEditingDay(false)}
          onSave={handleSaveDayMeta}
        />
      )}
      <ConfirmDialog
        open={removingDay}
        title="Remove this day?"
        body={`"${dayTitle}" and its ${count} stop${count === 1 ? '' : 's'} will be removed. This can’t be undone.`}
        confirmLabel="Remove day"
        onCancel={() => setRemovingDay(false)}
        onConfirm={handleRemoveDay}
      />
    </div>
  )
}
