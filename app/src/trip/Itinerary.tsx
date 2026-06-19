import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import type { PlannerOutletContext } from './PlannerLayout'
import { DayRail } from './DayRail'
import { StopList } from './StopList'
import { AddStop } from './AddStop'
import { useSaveTrip } from './useSaveTrip'
import { suggestDay } from './suggest'
import { dayLabel, stopCount } from './helpers'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/EmptyState'
import type { TripData } from '../types'

export default function Itinerary() {
  const { trip, canEdit } = useOutletContext<PlannerOutletContext>()
  const { save } = useSaveTrip(trip.id, canEdit)
  const [activeDay, setActiveDay] = useState(0)
  const [adding, setAdding] = useState(false)
  const [suggestingDay, setSuggestingDay] = useState(false)
  const [suggestError, setSuggestError] = useState<string | null>(null)

  const dayCount = trip.data?.days?.length || trip.config?.numDays || 0
  const day = Math.min(activeDay, Math.max(0, dayCount - 1))
  const count = stopCount(trip, day)

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
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <path d="M12 5v14M5 12h14" />
      </svg>
      Add a stop
    </Button>
  )

  return (
    <div className="px-5 md:px-8 py-6 max-w-5xl mx-auto">
      <div className="md:grid md:grid-cols-[200px_1fr] md:gap-8">
        <div className="mb-4 md:mb-0">
          <DayRail trip={trip} activeDay={day} onSelect={setActiveDay} />
        </div>

        <section aria-label={`Stops for ${dayLabel(trip, day)}`}>
          <div className="flex items-center justify-between gap-3 mb-1">
            <h2 className="font-serif text-2xl">{dayLabel(trip, day)}</h2>
            {canEdit && count > 0 && addStopButton}
          </div>

          {count > 0 ? (
            <StopList trip={trip} day={day} canEdit={canEdit} save={save} />
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
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M12 3l1.9 4.6L19 9l-4.1 1.4L12 15l-1.9-4.6L6 9l4.1-1.4L12 3z" />
                        </svg>
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

      {canEdit && (
        <AddStop open={adding} onClose={() => setAdding(false)} trip={trip} day={day} save={save} />
      )}
    </div>
  )
}
