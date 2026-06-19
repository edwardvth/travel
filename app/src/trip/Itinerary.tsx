import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import type { PlannerOutletContext } from './PlannerLayout'
import { DayRail } from './DayRail'
import { StopList } from './StopList'
import { useSaveTrip } from './useSaveTrip'
import { dayLabel, stopCount } from './helpers'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/EmptyState'

export default function Itinerary() {
  const { trip, canEdit } = useOutletContext<PlannerOutletContext>()
  const { save } = useSaveTrip(trip.id, canEdit)
  const [activeDay, setActiveDay] = useState(0)

  const dayCount = trip.data?.days?.length || trip.config?.numDays || 0
  const day = Math.min(activeDay, Math.max(0, dayCount - 1))
  const count = stopCount(trip, day)

  // AddStop sheet + "Suggest a day" are wired in P5; placeholders for now.
  const addStop = (
    <Button variant="claret" disabled title="Coming soon">
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
            {canEdit && count > 0 && addStop}
          </div>

          {count > 0 ? (
            <StopList trip={trip} day={day} canEdit={canEdit} save={save} />
          ) : (
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
                    {addStop}
                    <Button variant="soft" disabled title="Coming soon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 3l1.9 4.6L19 9l-4.1 1.4L12 15l-1.9-4.6L6 9l4.1-1.4L12 3z" />
                      </svg>
                      Suggest a day for me
                    </Button>
                  </div>
                ) : undefined
              }
            />
          )}
        </section>
      </div>
    </div>
  )
}
