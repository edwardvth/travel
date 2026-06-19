import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import type { PlannerOutletContext } from './PlannerLayout'
import { allReservations, setReservation, type ReservationEntry } from './reservation'
import { dayDate, dayLabel, formatDayDate } from './helpers'
import { formatStayDate } from './stay'
import { normalizeHotel } from './hotel'
import { BedDouble, Calendar, CheckCircle2, Clock, MapPin, type LucideIcon } from './icons'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import type { Hotel, Trip as TripT, TripData } from '../types'

/**
 * Trip tab — the trip's **logistics dashboard**: a reflection + management lens
 * over the same stop/stay/reservation data that Plan edits. Three sections, in
 * order: the **Stay** (hotel + check-in/out), **Upcoming** (reservations sorted
 * by date+time, leading with "Today" while the trip is in progress), and **Still
 * to arrange** (the actionable "Need to reserve" list).
 *
 * GUARDRAIL: Trip is strictly reflect + manage. It NEVER shapes the itinerary —
 * no add-stop, no reorder, no AI-suggest, no itinerary editing. The only writes
 * here are editing Stay fields and toggling a reservation's status, both
 * immutable through `save` and gated by `canEdit`. Tapping a reservation
 * deep-links to that stop in Plan, where shaping happens.
 */
export default function Trip() {
  const { trip, canEdit, save, setActiveDay } = useOutletContext<PlannerOutletContext>()
  const navigate = useNavigate()

  const entries = allReservations(trip)
  const toReserve = entries.filter(e => e.status === 'to_reserve')

  /** Clone data with the target day's stops array cloned (never mutate cache). */
  function cloneData(dayIndex: number): TripData {
    const data = trip.data
    return {
      ...data,
      days: data.days.map((d, i) => (i === dayIndex ? { ...d, stops: d.stops.slice() } : d)),
    }
  }

  /** Toggle a reservation to "Reserved" — immutable, edit-gated. */
  function markReserved(e: ReservationEntry) {
    if (!canEdit) return
    const data = cloneData(e.dayIndex)
    const current = data.days[e.dayIndex]?.stops[e.stopIndex]
    if (!current) return
    data.days[e.dayIndex].stops[e.stopIndex] = setReservation(current, { status: 'reserved' })
    save({ data })
  }

  function openStop(e: ReservationEntry) {
    setActiveDay(e.dayIndex)
    navigate(`/trip/${trip.id}/stop/${e.dayIndex}/${e.stopIndex}`)
  }

  return (
    <div className="px-5 md:px-8 py-8 max-w-3xl mx-auto">
      <h2 className="font-serif text-2xl">Trip</h2>
      <p className="text-muted text-[13.5px] mt-1.5">
        Your stay and reservations, in one place.
      </p>

      <div className="mt-7 space-y-9">
        <StaySection trip={trip} canEdit={canEdit} save={save} />
        <UpcomingSection trip={trip} entries={entries} onOpen={openStop} />
        <StillToArrangeSection
          trip={trip}
          entries={toReserve}
          canEdit={canEdit}
          onOpen={openStop}
          onMarkReserved={markReserved}
        />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ Stay --- */

/**
 * The Voyage base Stay — the source-of-truth `data.hotel` (shown read-only in
 * Plan via StayCard). Editable inline when `canEdit`: name, address, check-in /
 * check-out, notes. Preserves existing `lat/lng`. Empty state (edit): a calm
 * "Add your hotel" prompt; viewers with no stay see a quiet placeholder.
 */
function StaySection({ trip, canEdit, save }: {
  trip: TripT
  canEdit: boolean
  save: (partial: { data: TripData }) => void
}) {
  const hotel = normalizeHotel(trip.data?.hotel)
  const [editing, setEditing] = useState(false)

  return (
    <section aria-labelledby="trip-stay-h">
      <SectionHeader id="trip-stay-h" icon={BedDouble} title="Stay" />

      {editing ? (
        <StayEditor trip={trip} hotel={hotel} save={save} onDone={() => setEditing(false)} />
      ) : hotel ? (
        <div className="mt-3 rounded-card border border-hair bg-base px-4 py-3.5 flex items-start gap-3">
          <span className="flex-none grid place-items-center w-9 h-9 rounded-md bg-sig/10 text-sig" aria-hidden="true">
            <BedDouble size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-[15px] text-ink truncate">{hotel.name || 'Your stay'}</p>
            {hotel.address && <p className="text-muted text-[12.5px] truncate">{hotel.address}</p>}
            {(hotel.checkIn || hotel.checkOut) && (
              <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1.5">
                {hotel.checkIn && (
                  <div>
                    <dt className="text-[11px] font-bold uppercase tracking-wide text-muted">Check-in</dt>
                    <dd className="text-[13px] text-ink font-mono">{formatStayDate(hotel.checkIn)}</dd>
                  </div>
                )}
                {hotel.checkOut && (
                  <div>
                    <dt className="text-[11px] font-bold uppercase tracking-wide text-muted">Check-out</dt>
                    <dd className="text-[13px] text-ink font-mono">{formatStayDate(hotel.checkOut)}</dd>
                  </div>
                )}
              </dl>
            )}
            {hotel.note && <p className="text-ink/75 text-[12.5px] mt-2 leading-snug">{hotel.note}</p>}
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label="Edit your stay"
              className="flex-none -mr-1 -mt-0.5 grid place-items-center w-11 h-11 rounded-md text-muted hover:text-ink hover:bg-fill transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </button>
          )}
        </div>
      ) : canEdit ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-3 w-full flex items-center gap-3 rounded-card border border-dashed border-hair bg-fill/40 px-4 py-4 text-left text-muted hover:text-ink hover:bg-fill transition-colors cursor-pointer min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link"
        >
          <span className="flex-none grid place-items-center w-9 h-9 rounded-md bg-base" aria-hidden="true">
            <BedDouble size={18} />
          </span>
          <span>
            <span className="block text-[14px] font-bold text-ink">Add your hotel</span>
            <span className="block text-[12.5px] text-muted">Name, address, and check-in / check-out.</span>
          </span>
        </button>
      ) : (
        <EmptyState icon={BedDouble} text="No stay added yet." />
      )}
    </section>
  )
}

/** Inline editor for the Voyage Stay: name, address, check-in/out, notes. */
function StayEditor({ trip, hotel, save, onDone }: {
  trip: TripT
  hotel: Hotel | null
  save: (partial: { data: TripData }) => void
  onDone: () => void
}) {
  const [name, setName] = useState(hotel?.name ?? '')
  const [address, setAddress] = useState(hotel?.address ?? '')
  const [checkIn, setCheckIn] = useState(hotel?.checkIn ?? '')
  const [checkOut, setCheckOut] = useState(hotel?.checkOut ?? '')
  const [note, setNote] = useState(hotel?.note ?? '')

  // Re-seed if the underlying hotel changes while the editor is open.
  useEffect(() => {
    setName(hotel?.name ?? '')
    setAddress(hotel?.address ?? '')
    setCheckIn(hotel?.checkIn ?? '')
    setCheckOut(hotel?.checkOut ?? '')
    setNote(hotel?.note ?? '')
  }, [hotel])

  function onSave() {
    const next: Hotel = {}
    const n = name.trim()
    const a = address.trim()
    const ci = checkIn.trim()
    const co = checkOut.trim()
    const t = note.trim()
    if (n) next.name = n
    if (a) next.address = a
    if (ci) next.checkIn = ci
    if (co) next.checkOut = co
    if (t) next.note = t
    // Preserve any existing coords (set elsewhere) so editing text doesn't drop the pin.
    if (hotel?.lat !== undefined) next.lat = hotel.lat
    if (hotel?.lng !== undefined) next.lng = hotel.lng

    const hasContent = n || a || ci || co || t
    const data: TripData = { ...trip.data, hotel: hasContent ? next : null }
    save({ data })
    onDone()
  }

  const nameId = 'trip-stay-name'
  const addrId = 'trip-stay-address'
  const ciId = 'trip-stay-checkin'
  const coId = 'trip-stay-checkout'
  const noteId = 'trip-stay-note'

  return (
    <div className="mt-3 rounded-card border border-hair bg-base px-4 py-4 space-y-3">
      <div className="space-y-3">
        <label className="block" htmlFor={nameId}>
          <span className="block text-[12px] font-bold text-muted mb-1">Name</span>
          <Input id={nameId} value={name} onChange={e => setName(e.target.value)} placeholder="Hotel Edison NYC" autoFocus />
        </label>
        <label className="block" htmlFor={addrId}>
          <span className="block text-[12px] font-bold text-muted mb-1">Address</span>
          <Input id={addrId} value={address} onChange={e => setAddress(e.target.value)} placeholder="228 W 47th St, New York" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block" htmlFor={ciId}>
            <span className="block text-[12px] font-bold text-muted mb-1">Check-in</span>
            <Input id={ciId} type="date" value={checkIn} onChange={e => setCheckIn(e.target.value)} />
          </label>
          <label className="block" htmlFor={coId}>
            <span className="block text-[12px] font-bold text-muted mb-1">Check-out</span>
            <Input id={coId} type="date" value={checkOut} min={checkIn || undefined} onChange={e => setCheckOut(e.target.value)} />
          </label>
        </div>
        <label className="block" htmlFor={noteId}>
          <span className="block text-[12px] font-bold text-muted mb-1">Notes (optional)</span>
          <Input id={noteId} value={note} onChange={e => setNote(e.target.value)} placeholder="Confirmation #, breakfast included…" />
        </label>
      </div>
      <div className="flex items-center justify-end gap-2.5 pt-1">
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button variant="claret" onClick={onSave}>Save stay</Button>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------- Upcoming --- */

/** An entry decorated with its computed calendar date for sorting/grouping. */
interface DatedEntry extends ReservationEntry {
  date: string | null
  time: string | undefined
}

/** Local `YYYY-MM-DD` for today. */
function todayLocal(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/**
 * Decorate + sort reservations by date then time. Undated entries sort after
 * dated ones; within a date, timed before timeless. Stable, pure.
 */
function sortByDateTime(trip: TripT, entries: ReservationEntry[]): DatedEntry[] {
  const decorated: DatedEntry[] = entries.map(e => ({
    ...e,
    date: dayDate(trip, e.dayIndex),
    time: e.stop.reservation?.time ?? e.stop.booking?.time,
  }))
  return decorated
    .map((e, i) => ({ e, i }))
    .sort((a, b) => {
      // Dated before undated.
      if (a.e.date && !b.e.date) return -1
      if (!a.e.date && b.e.date) return 1
      if (a.e.date && b.e.date && a.e.date !== b.e.date) return a.e.date < b.e.date ? -1 : 1
      // Same date (or both undated): timed before timeless, then by time.
      if (a.e.time && !b.e.time) return -1
      if (!a.e.time && b.e.time) return 1
      if (a.e.time && b.e.time && a.e.time !== b.e.time) return a.e.time < b.e.time ? -1 : 1
      return a.i - b.i // stable
    })
    .map(x => x.e)
}

/**
 * Upcoming — every reservation (both states) sorted by date+time. If the trip is
 * in progress (today falls within the trip's day range), the list leads with a
 * "Today" group; otherwise it's a single chronological list. Tapping a row
 * deep-links to that stop in Plan.
 */
function UpcomingSection({ trip, entries, onOpen }: {
  trip: TripT
  entries: ReservationEntry[]
  onOpen: (e: ReservationEntry) => void
}) {
  const sorted = useMemo(() => sortByDateTime(trip, entries), [trip, entries])
  const today = todayLocal()

  // Trip is "in progress" when today matches one of the trip's day dates.
  const inProgress = useMemo(
    () => sorted.some(e => e.date === today),
    [sorted, today],
  )
  const todayGroup = inProgress ? sorted.filter(e => e.date === today) : []
  const rest = inProgress ? sorted.filter(e => e.date !== today) : sorted

  return (
    <section aria-labelledby="trip-upcoming-h">
      <SectionHeader id="trip-upcoming-h" icon={Calendar} title="Upcoming" count={entries.length} />

      {sorted.length === 0 ? (
        <EmptyState icon={Calendar} text="Your schedule is still empty" />
      ) : (
        <div className="mt-3 space-y-5">
          {todayGroup.length > 0 && (
            <ReservationList groupLabel="Today" trip={trip} entries={todayGroup} onOpen={onOpen} />
          )}
          {rest.length > 0 && (
            <ReservationList
              groupLabel={todayGroup.length > 0 ? 'Later' : undefined}
              trip={trip}
              entries={rest}
              onOpen={onOpen}
            />
          )}
        </div>
      )}
    </section>
  )
}

/** A labelled list of reservation rows (tap → open the stop in Plan). */
function ReservationList({ groupLabel, trip, entries, onOpen }: {
  groupLabel?: string
  trip: TripT
  entries: DatedEntry[]
  onOpen: (e: ReservationEntry) => void
}) {
  return (
    <div>
      {groupLabel && (
        <p className="text-[11.5px] font-bold uppercase tracking-wide text-muted mb-2">{groupLabel}</p>
      )}
      <ul className="divide-y divide-hair rounded-card border border-hair overflow-hidden" role="list">
        {entries.map(e => {
          const friendly = formatDayDate(e.date)
          const meta = friendly ?? dayLabel(trip, e.dayIndex)
          const confirmation = e.stop.reservation?.confirmation
          const reserved = e.status === 'reserved'
          return (
            <li key={`${e.dayIndex}-${e.stopIndex}`} className="bg-base">
              <button
                type="button"
                onClick={() => onOpen(e)}
                className="w-full flex items-center gap-3 text-left px-4 py-3 min-h-[44px] hover:bg-fill transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sig-link"
              >
                <span
                  className={
                    reserved
                      ? 'flex-none grid place-items-center w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : 'flex-none grid place-items-center w-8 h-8 rounded-full bg-fill text-muted'
                  }
                  aria-hidden="true"
                >
                  {reserved ? <CheckCircle2 size={16} /> : <MapPin size={16} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-sans font-semibold text-[14.5px] text-ink truncate">{e.stop.name}</span>
                  <span className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-[12px] text-muted">
                    <span>{meta}</span>
                    {e.time && (
                      <span className="inline-flex items-center gap-1 font-mono">
                        <Clock size={11} aria-hidden="true" /> {e.time}
                      </span>
                    )}
                    {confirmation && (
                      <span className="font-mono text-muted/80">#{confirmation}</span>
                    )}
                  </span>
                </span>
                <span
                  className={
                    reserved
                      ? 'flex-none text-[11px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400'
                      : 'flex-none text-[11px] font-bold uppercase tracking-wide text-muted'
                  }
                >
                  {reserved ? 'Reserved' : 'Need to reserve'}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/* ------------------------------------------------------ Still to arrange --- */

/**
 * Still to arrange — the actionable subset: reservations still marked "Need to
 * reserve". Each row deep-links to its stop; a one-tap "Mark reserved" toggles
 * the status (immutable, edit-gated). Empty state: "Nothing reserved yet".
 */
function StillToArrangeSection({ trip, entries, canEdit, onOpen, onMarkReserved }: {
  trip: TripT
  entries: ReservationEntry[]
  canEdit: boolean
  onOpen: (e: ReservationEntry) => void
  onMarkReserved: (e: ReservationEntry) => void
}) {
  const sorted = useMemo(() => sortByDateTime(trip, entries), [trip, entries])

  return (
    <section aria-labelledby="trip-arrange-h">
      <SectionHeader id="trip-arrange-h" icon={Clock} title="Still to arrange" count={entries.length} />

      {sorted.length === 0 ? (
        <EmptyState icon={CheckCircle2} text="Nothing reserved yet" />
      ) : (
        <ul className="mt-3 divide-y divide-hair rounded-card border border-hair overflow-hidden" role="list">
          {sorted.map(e => {
            const friendly = formatDayDate(e.date)
            const meta = friendly ?? dayLabel(trip, e.dayIndex)
            return (
              <li key={`${e.dayIndex}-${e.stopIndex}`} className="flex items-stretch bg-base">
                <button
                  type="button"
                  onClick={() => onOpen(e)}
                  className="flex-1 min-w-0 flex items-center gap-3 text-left px-4 py-3 min-h-[44px] hover:bg-fill transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sig-link"
                >
                  <span className="flex-none grid place-items-center w-8 h-8 rounded-full bg-fill text-muted" aria-hidden="true">
                    <MapPin size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-sans font-semibold text-[14.5px] text-ink truncate">{e.stop.name}</span>
                    <span className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-[12px] text-muted">
                      <span>{meta}</span>
                      {e.time && (
                        <span className="inline-flex items-center gap-1 font-mono">
                          <Clock size={11} aria-hidden="true" /> {e.time}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => onMarkReserved(e)}
                    aria-label={`Mark ${e.stop.name} reserved`}
                    className="flex-none inline-flex items-center gap-1.5 px-3.5 my-2 mr-2 rounded-btn text-[12.5px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors cursor-pointer min-h-[40px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link"
                  >
                    <CheckCircle2 size={15} aria-hidden="true" />
                    <span className="hidden sm:inline">Mark reserved</span>
                    <span className="sr-only sm:hidden">Mark reserved</span>
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/* --------------------------------------------------------------- shared --- */

/** Section header with an icon, title, and an optional count badge. */
function SectionHeader({ id, icon: Icon, title, count }: {
  id: string
  icon: LucideIcon
  title: string
  count?: number
}) {
  return (
    <h3 id={id} className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide text-ink">
      <Icon size={16} className="text-sig" aria-hidden="true" />
      {title}
      {typeof count === 'number' && count > 0 && (
        <span className="text-muted/70 font-normal normal-case tracking-normal">· {count}</span>
      )}
    </h3>
  )
}

/** A calm, centered empty state for a section. */
function EmptyState({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="mt-3 rounded-card border border-hair bg-fill px-5 py-8 text-center">
      <span className="inline-grid place-items-center w-11 h-11 rounded-full bg-base text-muted" aria-hidden="true">
        <Icon size={20} />
      </span>
      <p className="text-muted text-[13.5px] mt-3">{text}</p>
    </div>
  )
}
