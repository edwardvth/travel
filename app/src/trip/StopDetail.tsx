import { useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import type { PlannerOutletContext } from './PlannerLayout'
import { generateStopDetail } from './enrich'
import { fetchPlaceDetails } from './placeDetails'
import { stopHoursLabel } from './stop-hours'
import { toInputTime, fromInputTime } from './time'
import { destinationOf, heroQueries } from './landmark-context'
import { useHeroImage, usePrefetchHeroImages } from '../data/useLandmarkImage'
import { isCompleted, dayDate } from './helpers'
import { Calendar, CheckCircle2, Clock, Heart, Lightbulb, MapPin, kindIcon, kindLabel, stopKind } from './icons'
import { remapCompletedAfterDelete, toggleCompleted } from './itinerary-helpers'
import { reservationStatus, setReservation, type Reservation } from './reservation'
import { applyLocation, type PlaceLocation } from './location'
import { useGeocodeBackfill } from '../data/useGeocodeBackfill'
import { coverPhoto } from './photo'
import { formatInline } from './richtext'
import { StopPhotos } from './StopPhotos'
import { ChangeLocation } from './ChangeLocation'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Skeleton } from '../components/ui/Skeleton'
import { ConfirmDialog } from '../components/ConfirmDialog'
import type { Stop, TripData } from '../types'

const STOP_TYPES = [
  'Attraction', 'Museum', 'Restaurant', 'Cafe', 'Bar', 'Pub', 'Park',
  'Church', 'Gallery', 'Market', 'Shop', 'Theatre', 'Monument', 'Hotel',
]

export default function StopDetail() {
  const { trip, canEdit, save } = useOutletContext<PlannerOutletContext>()
  const navigate = useNavigate()
  const { day: dayParam, n: nParam } = useParams<{ day: string; n: string }>()
  const { backfillCoords } = useGeocodeBackfill(trip.id, save)

  const day = Number(dayParam)
  const n = Number(nParam)
  const days = trip.data?.days ?? []
  const stops = days[day]?.stops ?? []
  const stop = stops[n] as Stop | undefined

  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const [editingType, setEditingType] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(false)
  const [relocating, setRelocating] = useState(false)

  // Images: stored cover first, else the same on-demand Wikipedia image Guide
  // uses (shared cache). Prefetch every stop on this day so paging the prev/next
  // links is instant — no per-stop API lag. (Hooks run before the guard below.)
  const destination = destinationOf(trip)
  usePrefetchHeroImages(stops.filter(s => !coverPhoto(s)).map(s => heroQueries(s.name, destination)))
  const storedCover = stop ? coverPhoto(stop) : undefined
  const { url: landmarkCover } = useHeroImage(stop && !storedCover ? heroQueries(stop.name, destination) : [])

  // ── Out-of-range guard ─────────────────────────────────────────────
  if (!stop) {
    return (
      <div className="px-5 md:px-8 py-16 max-w-3xl mx-auto text-center">
        <h2 className="font-serif text-2xl">We couldn’t find that stop</h2>
        <p className="text-muted text-[14px] mt-2">
          It may have been removed or reordered. Head back to your plan to pick it up.
        </p>
        <div className="mt-6">
          <Link to={`/trip/${trip.id}`}>
            <Button variant="claret">Back to your plan</Button>
          </Link>
        </div>
      </div>
    )
  }

  const done = isCompleted(trip.data?.completed, day, n)
  const hasContent = !!(stop.history || (stop.facts && stop.facts.length) || stop.tips)
  const meta = [stop.type, stop.time, stop.address].filter(Boolean).join(' · ')
  const kind = stopKind(stop)
  const hoursLabel = stopHoursLabel(stop.hours, dayDate(trip, day) ?? undefined)
  const KindIcon = kindIcon(kind)
  const reservation = reservationStatus(stop)
  const reservationTime = stop.reservation?.time ?? stop.booking?.time
  const cover = storedCover ?? landmarkCover

  /** Clone trip.data with this day's stops array cloned, so we never mutate cache. */
  function cloneData(): TripData {
    const data = trip.data
    return {
      ...data,
      days: data.days.map((d, i) => (i === day ? { ...d, stops: d.stops.slice() } : d)),
    }
  }

  /** Immutably patch this stop and persist. */
  function patchStop(patch: Partial<Stop>) {
    if (!canEdit) return
    const data = cloneData()
    data.days[day].stops[n] = { ...data.days[day].stops[n], ...patch }
    save({ data })
  }

  /** Immutably set/clear this stop's reservation and persist. */
  function patchReservation(patch: Partial<Reservation> | null) {
    if (!canEdit) return
    const data = cloneData()
    const current = data.days[day].stops[n]
    if (!current) return
    data.days[day].stops[n] = setReservation(current, patch)
    save({ data })
  }

  /** Immutably replace this stop's `photos` array and persist. */
  function patchPhotos(next: string[]) {
    if (!canEdit) return
    const data = cloneData()
    const current = data.days[day].stops[n]
    if (!current) return
    data.days[day].stops[n] = next.length
      ? { ...current, photos: next }
      : (() => { const { photos: _drop, ...rest } = current; void _drop; return rest })()
    save({ data })
  }

  /** Immutably re-locate this stop — replaces name/type/address/coords and
   *  clears the now-stale place-derived enrichment, preserving photos/note/
   *  reservation/kind/time (see `applyLocation`). The map pin + walk connectors
   *  re-derive from the new coords automatically. */
  function handleChangeLocation(place: PlaceLocation) {
    if (!canEdit) return
    const data = cloneData()
    const current = data.days[day].stops[n]
    if (!current) return
    data.days[day].stops[n] = applyLocation(current, place)
    save({ data })
    // Fire-and-forget: resolve coordinates for a coordless re-pick so the
    // relocated stop still earns a pin. Guarded against a further relocate race.
    if (place.lat == null) {
      backfillCoords(day, place.name, place.address, destinationOf(trip))
    }
  }

  const photos = stop.photos ?? []
  const handleAddPhotos = (urls: string[]) => patchPhotos([...photos, ...urls])
  const handleSetCover = (i: number) =>
    patchPhotos([photos[i], ...photos.slice(0, i), ...photos.slice(i + 1)])
  const handleRemovePhoto = (i: number) =>
    patchPhotos(photos.filter((_, j) => j !== i))

  async function handleGenerate() {
    if (!canEdit || generating || !stop) return
    setGenerating(true)
    setGenError(null)
    try {
      const dest = destinationOf(trip)
      const [result, details] = await Promise.all([
        generateStopDetail(stop as Stop, trip.title, dest),
        fetchPlaceDetails({
          placeId: stop.placeId,
          query: [stop.name, dest].filter(Boolean).join(', '),
        }),
      ])
      patchStop({
        history: result.history,
        facts: result.facts,
        tips: result.tips,
        notice: result.notice,
        goodFor: result.goodFor || undefined,
        ...(details.hours ? { hours: details.hours } : {}),
        ...(details.price ? { price: details.price } : {}),
        ...(details.placeId && !stop.placeId ? { placeId: details.placeId, placeSource: 'google' as const } : {}),
      })
    } catch (e) {
      setGenError(
        e instanceof Error
          ? `I couldn’t gather details just now — ${e.message}`
          : 'I couldn’t gather details just now. Give it another go in a moment.',
      )
    } finally {
      setGenerating(false)
    }
  }

  function handleToggleDone() {
    if (!canEdit) return
    const data = cloneData()
    data.completed = toggleCompleted(trip.data?.completed, day, n)
    save({ data })
  }

  function handleDelete() {
    if (!canEdit) return
    const data = cloneData()
    data.days[day].stops.splice(n, 1)
    data.completed = remapCompletedAfterDelete(trip.data?.completed, day, n)
    save({ data })
    setPendingDelete(false)
    navigate(`/trip/${trip.id}`)
  }

  const prev = n > 0 ? n - 1 : null
  const next = n < stops.length - 1 ? n + 1 : null

  return (
    <div className="max-w-3xl mx-auto w-full min-w-0 pb-12">
      {/* ── Hero image / placeholder — cropped + inset so its edges align
          with the margins of the description below (not full-bleed). ── */}
      <div className="px-5 md:px-8 pt-4">
        {cover ? (
          <img
            src={cover}
            alt=""
            className="w-full h-52 md:h-72 object-cover rounded-card border border-hair bg-raised"
          />
        ) : (
          <div
            className="w-full h-44 md:h-56 grid place-items-center rounded-card border border-hair bg-sig-btn/10 text-sig"
            aria-hidden="true"
          >
            <KindIcon size={44} strokeWidth={1.5} />
            <span className="sr-only">{kindLabel(kind)}</span>
          </div>
        )}
      </div>

      <div className="px-5 md:px-8 mt-4">
        <div className="bg-base rounded-card border border-hair shadow-card px-5 md:px-7 py-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-serif text-[26px] md:text-3xl leading-tight break-words">{stop.name}</h1>
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                <span className="inline-flex items-center gap-1 rounded-full bg-fill px-2 py-0.5 text-[11.5px] font-semibold text-muted">
                  <KindIcon size={12} aria-hidden="true" />
                  {kindLabel(kind)}
                </span>
                {reservation === 'to_reserve' && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-[11.5px] font-bold text-amber-700 dark:text-amber-300">
                    <Calendar size={12} aria-hidden="true" />
                    Need to reserve
                  </span>
                )}
                {reservation === 'reserved' && (
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-bold text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 size={12} aria-hidden="true" />
                    {reservationTime ? `Reserved · ${reservationTime}` : 'Reserved'}
                  </span>
                )}
                {hoursLabel && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-fill px-2 py-0.5 text-[11.5px] font-semibold text-muted">
                    <Clock size={12} aria-hidden="true" />
                    {hoursLabel}
                  </span>
                )}
                {stop.price && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-fill px-2 py-0.5 text-[11.5px] font-mono font-semibold text-muted"
                    aria-label={`Price level ${stop.price}`}
                  >
                    {stop.price}
                  </span>
                )}
                {stop.goodFor && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-fill px-2 py-0.5 text-[11.5px] font-semibold text-muted">
                    <Heart size={12} aria-hidden="true" />
                    {stop.goodFor}
                  </span>
                )}
                {meta && <p className="text-muted text-[13.5px] min-w-0 basis-full break-words">{meta}</p>}
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setRelocating(true)}
                  className="mt-2 inline-flex items-center gap-1.5 min-h-[44px] -ml-2 px-2 rounded-md text-[12.5px] font-bold text-muted hover:text-sig-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link"
                >
                  <MapPin size={14} aria-hidden="true" />
                  Change location
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Content sections ─────────────────────────────────────── */}
      <div className="px-5 md:px-8 mt-6 space-y-6">
        {/* Photos — gallery + lightbox; add/cover/delete are edit-gated inside */}
        <StopPhotos
          photos={stop.photos ?? []}
          stopName={stop.name}
          canEdit={canEdit}
          onAdd={handleAddPhotos}
          onSetCover={handleSetCover}
          onRemove={handleRemovePhoto}
        />

        {/* Generate / Re-generate (edit-only) */}
        {canEdit && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-muted text-[13px]">
              {hasContent
                ? 'History, facts and tips for this place.'
                : 'No details yet — let Passage gather the story for you.'}
            </p>
            <Button
              variant={hasContent ? 'soft' : 'claret'}
              busy={generating}
              onClick={handleGenerate}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3l1.9 4.6L19 9l-4.1 1.4L12 15l-1.9-4.6L6 9l4.1-1.4L12 3z" />
              </svg>
              {hasContent ? 'Re-generate' : 'Generate details'}
            </Button>
          </div>
        )}

        {genError && (
          <p className="text-[13px] text-sig bg-sig/5 border border-sig/20 rounded-card px-4 py-3">
            {genError}
          </p>
        )}

        {/* When there's nothing yet and we can't edit, keep it friendly (never blank). */}
        {!hasContent && !generating && !canEdit && (
          <p className="text-muted text-[14px]">
            No details have been added for this stop yet.
          </p>
        )}

        {/* History */}
        {(generating || stop.history) && (
          <section>
            <h2 className="font-serif text-xl mb-2">History &amp; context</h2>
            {generating ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-[92%]" />
                <Skeleton className="h-4 w-[80%]" />
              </div>
            ) : (
              <div className="space-y-3">
                {(stop.history ?? '').split('\n\n').filter(Boolean).map((para, i) => (
                  <p
                    key={i}
                    className="text-[14.5px] leading-relaxed text-ink/90 break-words"
                    dangerouslySetInnerHTML={{ __html: formatInline(para.replace(/\n/g, ' ')) }}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {/* Facts */}
        {(generating || (stop.facts && stop.facts.length > 0)) && (
          <section>
            <h2 className="font-serif text-xl mb-2">Interesting facts</h2>
            {generating ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full rounded-card" />
                <Skeleton className="h-10 w-full rounded-card" />
              </div>
            ) : (
              <ul className="space-y-2">
                {(stop.facts ?? []).map((fact, i) => (
                  <li
                    key={i}
                    className="flex gap-3 items-start rounded-card bg-fill px-3.5 py-2.5 text-[14px] leading-relaxed"
                  >
                    <span aria-hidden="true" className="flex-none text-sig mt-0.5">
                      <Lightbulb size={15} />
                    </span>
                    <span className="min-w-0 break-words text-ink/90" dangerouslySetInnerHTML={{ __html: formatInline(fact) }} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Tips */}
        {(generating || stop.tips) && (
          <section>
            <h2 className="font-serif text-xl mb-2">Visitor tips</h2>
            {generating ? (
              <Skeleton className="h-12 w-full rounded-card" />
            ) : (
              <p
                className="text-[14px] leading-relaxed bg-amber-50 dark:bg-amber-500/10 border-l-[3px] border-amber-400 rounded-r-card px-4 py-3 text-ink/90 break-words"
                dangerouslySetInnerHTML={{ __html: formatInline(stop.tips ?? '') }}
              />
            )}
          </section>
        )}

        {/* ── Actions (edit-only) ────────────────────────────────── */}
        {canEdit && (
          <section className="pt-2 border-t border-hair">
            <h2 className="font-serif text-xl mb-3 mt-4">Edit this stop</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Time */}
              <label className="block">
                <span className="block text-[12.5px] font-bold text-muted mb-1.5">Time</span>
                <Input
                  type="time"
                  value={toInputTime(stop.time)}
                  onChange={e => patchStop({ time: fromInputTime(e.target.value) })}
                />
              </label>

              {/* Type */}
              <div className="block">
                <span className="block text-[12.5px] font-bold text-muted mb-1.5">Type</span>
                {editingType ? (
                  <select
                    autoFocus
                    value={STOP_TYPES.includes(stop.type ?? '') ? stop.type : ''}
                    onChange={e => { patchStop({ type: e.target.value || undefined }); setEditingType(false) }}
                    onBlur={() => setEditingType(false)}
                    className="w-full rounded-btn bg-fill border border-hair px-4 py-3 text-[15px] text-ink outline-none focus:border-sig-link"
                  >
                    <option value="">Unspecified</option>
                    {STOP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditingType(true)}
                    className="w-full text-left rounded-btn bg-fill border border-hair px-4 py-3 text-[15px] text-ink hover:bg-fill-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link"
                  >
                    {stop.type || <span className="text-muted">Set a type…</span>}
                  </button>
                )}
              </div>
            </div>

            {/* Reservation — explicit reservation tracking for this stop */}
            <div className="mt-5 rounded-card border border-hair bg-fill px-4 py-3.5">
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-ink">
                  <Calendar size={14} aria-hidden="true" className="text-muted" />
                  Reservation
                </span>
                {reservation === null ? (
                  <Button variant="soft" onClick={() => patchReservation({ status: 'to_reserve' })}>
                    Add to reservations
                  </Button>
                ) : reservation === 'to_reserve' ? (
                  <Button variant="claret" onClick={() => patchReservation({ status: 'reserved' })}>
                    <CheckCircle2 size={15} aria-hidden="true" />
                    Mark reserved
                  </Button>
                ) : (
                  <Button variant="soft" onClick={() => patchReservation({ status: 'to_reserve' })}>
                    Reserved — undo
                  </Button>
                )}
              </div>

              {reservation !== null && (
                <>
                  <p className="text-muted text-[12.5px] mt-2">
                    {reservation === 'to_reserve'
                      ? 'Still need to reserve. It’s on your reservations checklist.'
                      : 'Reserved. Marked done on your reservations checklist.'}
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 mt-3">
                    <label className="block">
                      <span className="block text-[12px] font-bold text-muted mb-1.5">Reservation time</span>
                      <Input
                        type="time"
                        value={toInputTime(reservationTime)}
                        onChange={e => patchReservation({ time: fromInputTime(e.target.value) })}
                      />
                    </label>
                    <label className="block">
                      <span className="block text-[12px] font-bold text-muted mb-1.5">Confirmation #</span>
                      <Input
                        type="text"
                        placeholder="Reservation ref, e.g. ABC123"
                        value={stop.reservation?.confirmation ?? ''}
                        onChange={e => patchReservation({ confirmation: e.target.value })}
                      />
                    </label>
                    <label className="block sm:col-span-2">
                      <span className="block text-[12px] font-bold text-muted mb-1.5">Reservation note</span>
                      <Input
                        type="text"
                        placeholder="Party size, special requests…"
                        value={stop.reservation?.note ?? stop.booking?.note ?? ''}
                        onChange={e => patchReservation({ note: e.target.value })}
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={() => patchReservation(null)}
                    className="mt-3 text-[12.5px] font-bold text-muted hover:text-sig focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link rounded-md px-1"
                  >
                    Remove from reservations
                  </button>
                </>
              )}
            </div>

            <div className="flex flex-wrap gap-2.5 mt-4">
              <Button variant={done ? 'claret' : 'soft'} onClick={handleToggleDone}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                {done ? 'Done' : 'Mark done'}
              </Button>
              <Button
                variant="ghost"
                className="text-sig border-sig/30 hover:bg-sig/5"
                onClick={() => setPendingDelete(true)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                </svg>
                Delete stop
              </Button>
            </div>
          </section>
        )}

        {/* ── Prev / next nav ────────────────────────────────────── */}
        <nav className="flex items-center justify-between gap-3 pt-4 border-t border-hair" aria-label="Stops in this day">
          {prev !== null ? (
            <Link
              to={`/trip/${trip.id}/stop/${day}/${prev}`}
              className="inline-flex items-center gap-2 text-[13.5px] font-bold text-ink hover:text-sig-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link rounded-md px-2 py-1 min-w-0"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 18l-6-6 6-6" />
              </svg>
              <span className="truncate min-w-0">{stops[prev]?.name ?? 'Previous'}</span>
            </Link>
          ) : <span />}
          {next !== null ? (
            <Link
              to={`/trip/${trip.id}/stop/${day}/${next}`}
              className="inline-flex items-center gap-2 text-[13.5px] font-bold text-ink hover:text-sig-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link rounded-md px-2 py-1 min-w-0 text-right"
            >
              <span className="truncate min-w-0">{stops[next]?.name ?? 'Next'}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </Link>
          ) : <span />}
        </nav>
      </div>

      <ConfirmDialog
        open={pendingDelete}
        title="Remove stop?"
        body={`"${stop.name}" will be removed from this day. This can’t be undone.`}
        confirmLabel="Remove"
        onCancel={() => setPendingDelete(false)}
        onConfirm={handleDelete}
      />

      {canEdit && (
        <ChangeLocation
          open={relocating}
          onClose={() => setRelocating(false)}
          stop={stop}
          tripTitle={trip.title}
          onConfirm={handleChangeLocation}
        />
      )}
    </div>
  )
}

