import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import type { PlannerOutletContext } from './PlannerLayout'
import { useAuth } from '../auth/useAuth'
import { useProfile, isFounder } from '../data/useProfile'
import { useDeleteTrip } from '../data/useTrips'
import { useBackfillDestinationGeo } from '../data/useBackfillDestinationGeo'
import { allReservations, setReservation, type ReservationEntry } from './reservation'
import { dayDate, dayLabel, formatDayDate } from './helpers'
import { formatStayDate } from './stay'
import { normalizeHotel } from './hotel'
import {
  applyTripBasics,
  daysBetween,
  droppingDaysWithStops,
  endDateFor,
  parseImportedTrip,
  resetTripData,
} from './settings-helpers'
import { tripNotes } from '../lib/trip-helpers'
import { DestinationInput } from '../components/DestinationInput'
import { coverPreview, resizeToDataUrl } from './photo'
import { BedDouble, Calendar, CheckCircle2, Clock, MapPin, Image as ImageIcon, RotateCcw, type LucideIcon } from './icons'
import {
  AlertTriangle,
  CalendarDays,
  ChevronRight,
  Download,
  FileText,
  Pencil,
  Trash2,
  Upload,
} from 'lucide-react'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { Sheet } from '../components/ui/Sheet'
import { ConfirmDialog } from '../components/ConfirmDialog'
import type { Hotel, Trip as TripT, TripData, TripConfig } from '../types'

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
  const { user } = useAuth()
  const { data: profile } = useProfile(user?.id)

  // Delete is owner-gated: the trip owner, or a founder. The `delete_trip` RPC
  // also enforces ownership server-side, so this is a UX gate, not the guard.
  const canDelete = isFounder(profile) || (!!trip.owner_id && trip.owner_id === user?.id)

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
        <TripDetailsSection trip={trip} canEdit={canEdit} save={save} />
        <ManageSection trip={trip} canEdit={canEdit} canDelete={canDelete} save={save} />
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
      <SectionHeader id="trip-upcoming-h" icon={Calendar} title="Upcoming" count={sorted.length} />

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

/* ----------------------------------------------------------- Trip Details --- */

type SaveFn = PlannerOutletContext['save']

/**
 * Trip Details — a pure **read/edit projection over `config`**, never a second
 * store. It surfaces the three trip-level facts that live on `config`: the
 * **dates** (first day `config.startDate` → last day via `endDateFor`), the
 * derived **length** (day count), and free-form **travel notes** (read via
 * `tripNotes` — `config.notes`, falling back to legacy `config.travelerNotes`).
 * The notes textarea writes `config.notes` immutably and is edit-gated. "Edit
 * trip…" opens a small sheet for title + destination + first/last day, reusing
 * `applyTripBasics` and the day-drop confirm flow — so every field here maps
 * directly back to `config`/`data`, with no duplicate state.
 */
function TripDetailsSection({ trip, canEdit, save }: {
  trip: TripT
  canEdit: boolean
  save: SaveFn
}) {
  const [editing, setEditing] = useState(false)

  const startDate = trip.config?.startDate || ''
  const numDays = trip.data?.days?.length || trip.config?.numDays || 1
  const endDate = startDate ? endDateFor(startDate, numDays) : ''
  const firstFriendly = formatDayDate(startDate || null)
  const lastFriendly = formatDayDate(endDate || null)

  // Notes is a projection of config.notes (with legacy config.travelerNotes
  // back-compat via tripNotes) — local state is just the in-flight edit buffer,
  // re-seeded whenever the persisted value changes (no second store). New writes
  // below always go to config.notes only.
  const persistedNotes = tripNotes(trip.config)
  const [notes, setNotes] = useState(persistedNotes)
  useEffect(() => { setNotes(persistedNotes) }, [persistedNotes])
  const notesId = useId()

  const commitNotes = () => {
    if (!canEdit) return
    const next = notes.trim()
    if (next === persistedNotes) return
    const config: TripConfig = { ...trip.config }
    if (next) config.notes = next
    else delete config.notes
    save({ config })
  }

  return (
    <section aria-labelledby="trip-details-h">
      <SectionHeader id="trip-details-h" icon={FileText} title="Trip details" />

      <div className="mt-3 rounded-card border border-hair bg-base px-4 py-4 space-y-4">
        {/* Dates + length — read-only projection of config. */}
        <dl className="flex flex-wrap gap-x-8 gap-y-3">
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-wide text-muted">Dates</dt>
            <dd className="text-[14px] text-ink mt-0.5">
              {firstFriendly ? (
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays size={14} className="text-sig flex-none" aria-hidden="true" />
                  <span className="font-mono">{firstFriendly}</span>
                  {lastFriendly && lastFriendly !== firstFriendly && (
                    <>
                      <span className="text-muted" aria-hidden="true">→</span>
                      <span className="font-mono">{lastFriendly}</span>
                    </>
                  )}
                </span>
              ) : (
                <span className="text-muted">No dates set</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-wide text-muted">Length</dt>
            <dd className="text-[14px] text-ink mt-0.5 font-mono">
              {numDays} day{numDays === 1 ? '' : 's'}
            </dd>
          </div>
        </dl>

        {/* Travel notes — config.notes, editable multiline when canEdit. */}
        <div>
          <label htmlFor={notesId} className="block text-[11px] font-bold uppercase tracking-wide text-muted mb-1.5">
            Travel notes
          </label>
          {canEdit ? (
            <textarea
              id={notesId}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              onBlur={commitNotes}
              rows={3}
              placeholder="Flight numbers, who's coming, packing reminders…"
              className="w-full rounded-btn bg-fill border border-hair px-4 py-3 text-[14px] text-ink placeholder:text-muted outline-none focus:border-sig-link transition-colors resize-y leading-relaxed"
            />
          ) : persistedNotes ? (
            <p className="text-[14px] text-ink/85 whitespace-pre-wrap leading-relaxed">{persistedNotes}</p>
          ) : (
            <p className="text-[13.5px] text-muted">No notes yet.</p>
          )}
        </div>

        {/* Edit trip basics — title + dates, reusing applyTripBasics. */}
        {canEdit && (
          <div className="pt-0.5">
            <Button variant="soft" onClick={() => setEditing(true)}>
              <Pencil size={15} aria-hidden="true" /> Edit trip…
            </Button>
          </div>
        )}
      </div>

      {editing && (
        <TripBasicsEditor trip={trip} save={save} onClose={() => setEditing(false)} />
      )}
    </section>
  )
}

/**
 * A small editor sheet for the trip's title + destination + first/last day.
 * Reuses `applyTripBasics` (recomputes day labels + resyncs `data.days`) and
 * `daysBetween`/`endDateFor`; destination is layered onto the returned `config`
 * immutably (set when present, removed when cleared) via the same `DestinationInput`
 * used at creation. If shortening drops days that still have stops
 * (`droppingDaysWithStops`), it raises the existing "Remove days with stops?"
 * ConfirmDialog before persisting. Everything maps to `config`/`data`.
 */
function TripBasicsEditor({ trip, save, onClose }: {
  trip: TripT
  save: SaveFn
  onClose: () => void
}) {
  const backfillDestinationGeo = useBackfillDestinationGeo()
  const startDate = trip.config?.startDate || ''
  const numDays = trip.data?.days?.length || trip.config?.numDays || 1
  const initialEnd = startDate ? endDateFor(startDate, numDays) : ''
  const initialDestination = typeof trip.config?.destination === 'string' ? trip.config.destination : ''

  const [title, setTitle] = useState(trip.title || '')
  const [destination, setDestination] = useState(initialDestination)
  const [start, setStart] = useState(startDate)
  const [end, setEnd] = useState(initialEnd)
  const [confirm, setConfirm] = useState(false)

  const persist = () => {
    const newCount = start && end ? daysBetween(start, end) : numDays
    const { config, data } = applyTripBasics(trip, {
      title: title.trim() || trip.title,
      subtitle: trip.subtitle ?? '',
      startDate: start,
      numDays: newCount,
    })
    // Layer destination onto config immutably — set when present, clear when emptied.
    const dest = destination.trim()
    if (dest) config.destination = dest
    else delete config.destination
    save({ title: config.title || trip.title, config, data })
    if (dest) void backfillDestinationGeo({ id: trip.id, destination: dest })
    onClose()
  }

  const onSave = () => {
    const newCount = start && end ? daysBetween(start, end) : numDays
    if (newCount < numDays && droppingDaysWithStops(trip.data?.days, newCount)) {
      setConfirm(true)
      return
    }
    persist()
  }

  const titleId = 'trip-basics-title'
  const startId = 'trip-basics-start'
  const endId = 'trip-basics-end'

  return (
    <Sheet open onClose={onClose} labelledBy="trip-basics-h">
      <h2 id="trip-basics-h" className="font-serif text-2xl">Edit trip</h2>
      <p className="text-muted text-[13.5px] mt-1.5">
        Title, destination and dates. These live on the trip itself.
      </p>

      <div className="mt-5 space-y-4">
        <label className="block" htmlFor={titleId}>
          <span className="block text-[12px] font-bold text-muted uppercase tracking-wide mb-1.5">Title</span>
          <Input id={titleId} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. NYC 2026" autoFocus />
        </label>
        <div className="block">
          <span className="block text-[12px] font-bold text-muted uppercase tracking-wide mb-1.5">Destination</span>
          <DestinationInput value={destination} onChange={setDestination} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block" htmlFor={startId}>
            <span className="block text-[12px] font-bold text-muted uppercase tracking-wide mb-1.5">First day</span>
            <Input id={startId} type="date" value={start} onChange={e => setStart(e.target.value)} />
          </label>
          <label className="block" htmlFor={endId}>
            <span className="block text-[12px] font-bold text-muted uppercase tracking-wide mb-1.5">Last day</span>
            <Input id={endId} type="date" value={end} min={start || undefined} onChange={e => setEnd(e.target.value)} />
          </label>
        </div>
        {start && end && (
          <p className="text-[12.5px] text-muted">
            {daysBetween(start, end)} day{daysBetween(start, end) === 1 ? '' : 's'} total.
          </p>
        )}
      </div>

      <div className="mt-6 flex gap-2.5">
        <Button variant="soft" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button variant="claret" className="flex-1" onClick={onSave}>Save trip</Button>
      </div>

      <ConfirmDialog
        open={confirm}
        title="Remove days with stops?"
        body="Shortening the trip will drop the last day(s), and some of them still have stops. Those stops will be deleted."
        confirmLabel="Remove days"
        onCancel={() => setConfirm(false)}
        onConfirm={() => { setConfirm(false); persist() }}
      />
    </Sheet>
  )
}

/* --------------------------------------------------------- Manage this trip --- */

/**
 * Manage this trip — a disclosure section, **collapsed by default**, that expands
 * only on an explicit click of its header (Chevron + `aria-expanded`/
 * `aria-controls`, no auto-expand). When open it holds the trip-level data
 * actions moved verbatim from the old Settings → Data tab — Export JSON, Import
 * JSON, Reset trip (same helpers + ConfirmDialog) — plus a guarded **Delete
 * trip** wired to the shared `useDeleteTrip` path (owner-gated). Destructive
 * actions all confirm. No Duplicate/Archive (future — intentionally omitted).
 */
function ManageSection({ trip, canEdit, canDelete, save }: {
  trip: TripT
  canEdit: boolean
  canDelete: boolean
  save: SaveFn
}) {
  const [open, setOpen] = useState(false) // collapsed by default; opens only on click.
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const coverRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const [resetOpen, setResetOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const del = useDeleteTrip()
  const panelId = useId()

  const onExport = () => {
    const payload = { id: trip.id, title: trip.title, subtitle: trip.subtitle, config: trip.config, data: trip.data }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${trip.id}.json`
    a.click()
    URL.revokeObjectURL(url)
    setMsg({ tone: 'ok', text: 'Exported as JSON.' })
  }

  const onImportFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const raw = JSON.parse(String(e.target?.result ?? ''))
        const parsed = parseImportedTrip(raw, trip)
        if (!window.confirm('Import this file? It will replace the current trip’s days, stay and completed state.')) return
        save({ title: parsed.title, subtitle: parsed.subtitle, config: parsed.config, data: parsed.data })
        setMsg({ tone: 'ok', text: 'Imported successfully.' })
      } catch (err) {
        setMsg({ tone: 'err', text: 'Import failed: ' + (err instanceof Error ? err.message : 'unknown error') })
      }
    }
    reader.readAsText(file)
  }

  // Cover photo. The thumbnail mirrors the first two (synchronous) priorities of
  // useTripCover; `hasManualCover` gates "Reset to automatic" on a stored key.
  const coverThumb = coverPreview(trip)
  const hasManualCover = typeof trip.config?.coverImage === 'string' && trip.config.coverImage.length > 0

  const onCoverFile = async (file: File) => {
    try {
      const dataUrl = await resizeToDataUrl(file)
      save({ config: { ...trip.config, coverImage: dataUrl } })
      setMsg({ tone: 'ok', text: 'Cover photo updated.' })
    } catch (err) {
      setMsg({ tone: 'err', text: err instanceof Error ? err.message : 'Couldn’t set that cover.' })
    }
  }

  const onResetCover = () => {
    const config: TripConfig = { ...trip.config }
    delete config.coverImage
    save({ config })
    setMsg({ tone: 'ok', text: 'Cover reset — using the destination automatically.' })
  }

  return (
    <section aria-labelledby="trip-manage-h">
      {/* Disclosure header — collapsed by default, toggles only on click. */}
      <h3 id="trip-manage-h" className="m-0">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          aria-controls={panelId}
          className="w-full flex items-center gap-2 min-h-[44px] text-[13px] font-bold uppercase tracking-wide text-ink hover:text-sig transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link rounded-btn -mx-1 px-1"
        >
          <ChevronRight
            size={16}
            aria-hidden="true"
            className={
              'flex-none text-sig transition-transform duration-200 ' + (open ? 'rotate-90' : '')
            }
          />
          Manage this trip
        </button>
      </h3>

      {open && (
        <div id={panelId} className="mt-3 space-y-5">
          {/* Cover photo — manual override; wins over the destination auto-pick
              because config.coverImage is top-priority in useTripCover/TripRow. */}
          {canEdit && (
            <div className="rounded-card border border-hair bg-base px-4 py-4 space-y-3">
              <p className="text-muted text-[13px]">Set the photo shown for this trip on the dashboard, or let it pick one from your destination.</p>
              <div className="flex items-center gap-3.5">
                {/* Reserve a fixed box so a loading/late thumbnail never shifts layout. */}
                <span className="relative h-[54px] w-[54px] flex-none overflow-hidden rounded-[12px] bg-raised grid place-items-center">
                  {coverThumb
                    ? <img src={coverThumb} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    : <ImageIcon size={20} className="text-muted" aria-hidden="true" />}
                </span>
                <div className="flex flex-wrap gap-3">
                  <Button variant="soft" onClick={() => coverRef.current?.click()}>
                    <Upload size={16} aria-hidden="true" /> Upload cover…
                  </Button>
                  {hasManualCover && (
                    <Button variant="ghost" onClick={onResetCover}>
                      <RotateCcw size={16} aria-hidden="true" /> Reset to automatic
                    </Button>
                  )}
                  <input
                    ref={coverRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => {
                      const f = e.target.files?.[0]
                      if (f) onCoverFile(f)
                      e.target.value = ''
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Export / Import — verbatim from the old Settings Data tab. */}
          <div className="rounded-card border border-hair bg-base px-4 py-4 space-y-3">
            <p className="text-muted text-[13px]">Back up this trip to a file, or restore from one.</p>
            <div className="flex flex-wrap gap-3">
              <Button variant="soft" onClick={onExport}>
                <Upload size={16} aria-hidden="true" /> Export JSON
              </Button>
              <Button variant="soft" disabled={!canEdit} onClick={() => fileRef.current?.click()}>
                <Download size={16} aria-hidden="true" /> Import JSON
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) onImportFile(f)
                  e.target.value = ''
                }}
              />
            </div>
          </div>

          {/* Shared status line for the cards above (cover / export / import). */}
          {msg && (
            <p
              role="status"
              aria-live="polite"
              className={msg.tone === 'ok' ? 'text-sig-link text-[12.5px]' : 'text-red-600 dark:text-red-400 text-[12.5px]'}
            >
              {msg.text}
            </p>
          )}

          {/* Danger zone — Reset + Delete. Both edit/owner-gated and confirmed. */}
          {(canEdit || canDelete) && (
            <div className="rounded-card border border-red-300/70 dark:border-red-500/30 bg-red-50/50 dark:bg-red-500/5 px-4 py-4 space-y-4">
              <p className="inline-flex items-center gap-1.5 text-[11px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wide">
                <AlertTriangle size={13} aria-hidden="true" /> Danger zone
              </p>

              {canEdit && (
                <div className="space-y-2">
                  <p className="text-muted text-[13px]">Clear every stop, the stay and all completed marks. The days stay, but they’ll be empty.</p>
                  <Button
                    variant="ghost"
                    className="border-red-300 dark:border-red-500/40 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
                    onClick={() => setResetOpen(true)}
                  >
                    <Trash2 size={16} aria-hidden="true" /> Reset trip
                  </Button>
                </div>
              )}

              {canDelete && (
                <div className="space-y-2">
                  <p className="text-muted text-[13px]">Permanently delete this trip for everyone it’s shared with. This can’t be undone.</p>
                  <Button
                    variant="ghost"
                    className="border-red-300 dark:border-red-500/40 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 size={16} aria-hidden="true" /> Delete trip
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={resetOpen}
        title="Reset this trip?"
        body="This empties every day (stops, stay and completed marks) for all your devices. The day count and titles are kept. This can’t be undone."
        confirmLabel="Reset trip"
        onCancel={() => setResetOpen(false)}
        onConfirm={() => {
          save({ data: resetTripData(trip) })
          setResetOpen(false)
          setMsg({ tone: 'ok', text: 'Trip data reset.' })
        }}
      />

      <ConfirmDialog
        open={deleteOpen}
        title="Delete this trip?"
        body="This permanently deletes the trip and removes it for everyone it’s shared with. This can’t be undone."
        confirmLabel="Delete trip"
        busy={del.isPending}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={async () => {
          try {
            await del.mutateAsync(trip.id)
            setDeleteOpen(false)
            navigate('/trips')
          } catch {
            setDeleteOpen(false)
            setMsg({ tone: 'err', text: 'Couldn’t delete this trip. Please try again.' })
          }
        }}
      />
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
