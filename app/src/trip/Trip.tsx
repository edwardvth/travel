import { useNavigate, useOutletContext } from 'react-router-dom'
import type { PlannerOutletContext } from './PlannerLayout'
import { allReservations, setReservation, type ReservationEntry, type Reservation } from './reservation'
import { dayLabel } from './helpers'
import { Calendar, CheckCircle2, Circle } from './icons'
import type { TripData } from '../types'

/**
 * Trip tab — a filtered checklist of every stop the user has marked across the
 * whole Voyage. Two groups: "Need to reserve" (actionable, top) and "Reserved"
 * (done, below). One tap moves an item between them; tapping the item opens that
 * stop. All writes are immutable through `save` and edit-gated via `canEdit`.
 *
 * NR4 rebuilds this into the full logistics dashboard; for now it keeps the
 * reservations checklist working against the new helpers + language.
 */
export default function Trip() {
  const { trip, canEdit, save, setActiveDay } = useOutletContext<PlannerOutletContext>()
  const navigate = useNavigate()

  const entries = allReservations(trip)
  const toReserve = entries.filter(e => e.status === 'to_reserve')
  const reserved = entries.filter(e => e.status === 'reserved')

  /** Clone data with the target day's stops array cloned (never mutate cache). */
  function cloneData(dayIndex: number): TripData {
    const data = trip.data
    return {
      ...data,
      days: data.days.map((d, i) => (i === dayIndex ? { ...d, stops: d.stops.slice() } : d)),
    }
  }

  function patchReservation(e: ReservationEntry, patch: Partial<Reservation> | null) {
    if (!canEdit) return
    const data = cloneData(e.dayIndex)
    const current = data.days[e.dayIndex]?.stops[e.stopIndex]
    if (!current) return
    data.days[e.dayIndex].stops[e.stopIndex] = setReservation(current, patch)
    save({ data })
  }

  function openStop(e: ReservationEntry) {
    setActiveDay(e.dayIndex)
    navigate(`/trip/${trip.id}/stop/${e.dayIndex}/${e.stopIndex}`)
  }

  const isEmpty = entries.length === 0

  return (
    <div className="px-5 md:px-8 py-8 max-w-3xl mx-auto">
      <h2 className="font-serif text-2xl">Trip</h2>
      <p className="text-muted text-[13.5px] mt-1.5">
        Reservations across your Voyage, in one place.
      </p>

      {isEmpty ? (
        <div className="mt-7 rounded-card border border-hair bg-fill px-5 py-10 text-center">
          <span className="inline-grid place-items-center w-12 h-12 rounded-full bg-base text-muted">
            <Calendar size={22} aria-hidden="true" />
          </span>
          <p className="text-muted text-[14px] mt-4 max-w-md mx-auto leading-relaxed">
            Nothing reserved yet — mark a stop <span className="font-bold text-ink">Need to reserve</span> to
            track reservations here.
          </p>
        </div>
      ) : (
        <div className="mt-7 space-y-8">
          <ReservationGroup
            title="Need to reserve"
            count={toReserve.length}
            entries={toReserve}
            trip={trip}
            canEdit={canEdit}
            onToggle={e => patchReservation(e, { status: 'reserved' })}
            onOpen={openStop}
            emptyHint="Nothing left to reserve."
          />
          <ReservationGroup
            title="Reserved"
            count={reserved.length}
            entries={reserved}
            trip={trip}
            canEdit={canEdit}
            onToggle={e => patchReservation(e, { status: 'to_reserve' })}
            onOpen={openStop}
            emptyHint="Nothing reserved yet."
          />
        </div>
      )}
    </div>
  )
}

function ReservationGroup({
  title, count, entries, trip, canEdit, onToggle, onOpen, emptyHint,
}: {
  title: string
  count: number
  entries: ReservationEntry[]
  trip: PlannerOutletContext['trip']
  canEdit: boolean
  onToggle: (e: ReservationEntry) => void
  onOpen: (e: ReservationEntry) => void
  emptyHint: string
}) {
  const done = title === 'Reserved'
  return (
    <section aria-label={title}>
      <h3 className="flex items-center gap-2 text-[12.5px] font-bold uppercase tracking-wide text-muted">
        {title}
        <span className="text-muted/70 normal-case tracking-normal">· {count}</span>
      </h3>

      {entries.length === 0 ? (
        <p className="text-muted/70 text-[13px] mt-2">{emptyHint}</p>
      ) : (
        <ul className="mt-2.5 divide-y divide-hair rounded-card border border-hair overflow-hidden" role="list">
          {entries.map(e => {
            const time = e.stop.reservation?.time ?? e.stop.booking?.time
            const checked = e.status === 'reserved'
            const label = `${dayLabel(trip, e.dayIndex)}${time ? ` · ${time}` : ''}`
            const toggleLabel = checked
              ? `Move ${e.stop.name} back to Need to reserve`
              : `Mark ${e.stop.name} reserved`
            return (
              <li key={`${e.dayIndex}-${e.stopIndex}`} className="flex items-stretch bg-base">
                {/* Toggle — edit only writes; viewers see static state */}
                {canEdit ? (
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    aria-label={toggleLabel}
                    onClick={() => onToggle(e)}
                    className="flex-none grid place-items-center w-12 min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sig-link"
                  >
                    {checked ? (
                      <CheckCircle2 size={20} className="text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                    ) : (
                      <Circle size={20} className="text-muted/60" aria-hidden="true" />
                    )}
                  </button>
                ) : (
                  <span
                    aria-hidden="true"
                    className="flex-none grid place-items-center w-12 min-h-[44px]"
                  >
                    {checked ? (
                      <CheckCircle2 size={20} className="text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <Circle size={20} className="text-muted/60" />
                    )}
                  </span>
                )}

                {/* Item body → open the stop */}
                <button
                  type="button"
                  onClick={() => onOpen(e)}
                  className="flex-1 min-w-0 flex items-center gap-3 text-left pr-3 py-2.5 min-h-[44px] hover:bg-fill transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sig-link"
                >
                  <span className="min-w-0 flex-1">
                    <span className={cnTitle(done)}>{e.stop.name}</span>
                    <span className="block text-[12px] text-muted truncate">{label}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/** Title styling: reserved items read as "done" (muted, struck). */
function cnTitle(done: boolean): string {
  return done
    ? 'block font-sans font-semibold text-[14.5px] truncate text-muted line-through'
    : 'block font-sans font-semibold text-[14.5px] truncate text-ink'
}
