import { useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import type { PlannerOutletContext } from './PlannerLayout'
import { generateStopDetail } from './enrich'
import { isCompleted, stopTypeEmoji } from './helpers'
import { remapCompletedAfterDelete, toggleCompleted } from './itinerary-helpers'
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

  const day = Number(dayParam)
  const n = Number(nParam)
  const days = trip.data?.days ?? []
  const stops = days[day]?.stops ?? []
  const stop = stops[n] as Stop | undefined

  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const [editingType, setEditingType] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(false)

  // ── Out-of-range guard ─────────────────────────────────────────────
  if (!stop) {
    return (
      <div className="px-5 md:px-8 py-16 max-w-3xl mx-auto text-center">
        <h2 className="font-serif text-2xl">We couldn’t find that stop</h2>
        <p className="text-muted text-[14px] mt-2">
          It may have been removed or reordered. Head back to the itinerary to pick it up.
        </p>
        <div className="mt-6">
          <Link to={`/trip/${trip.id}`}>
            <Button variant="claret">Back to itinerary</Button>
          </Link>
        </div>
      </div>
    )
  }

  const done = isCompleted(trip.data?.completed, day, n)
  const hasContent = !!(stop.history || (stop.facts && stop.facts.length) || stop.tips)
  const meta = [stop.type, stop.time, stop.address].filter(Boolean).join(' · ')

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

  async function handleGenerate() {
    if (!canEdit || generating) return
    setGenerating(true)
    setGenError(null)
    try {
      const result = await generateStopDetail(stop as Stop, trip.title)
      patchStop({ history: result.history, facts: result.facts, tips: result.tips })
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

  const hasCoords = stop.lat != null && stop.lng != null
  const mapsUrl = hasCoords
    ? `https://www.google.com/maps/search/?api=1&query=${stop.lat},${stop.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([stop.name, stop.address].filter(Boolean).join(' '))}`

  const prev = n > 0 ? n - 1 : null
  const next = n < stops.length - 1 ? n + 1 : null

  return (
    <div className="max-w-3xl mx-auto pb-12">
      {/* ── Hero image / placeholder ─────────────────────────────── */}
      {stop.image ? (
        <img
          src={stop.image}
          alt=""
          className="w-full h-52 md:h-72 object-cover bg-raised"
        />
      ) : (
        <div
          className="w-full h-44 md:h-56 grid place-items-center bg-sig-btn/10 text-[44px]"
          aria-hidden="true"
        >
          {stopTypeEmoji(stop.type)}
        </div>
      )}

      <div className="px-5 md:px-8 -mt-6">
        <div className="bg-base rounded-card border border-hair shadow-card px-5 md:px-7 py-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-serif text-[26px] md:text-3xl leading-tight">{stop.name}</h1>
              {meta && <p className="text-muted text-[13.5px] mt-1.5">{meta}</p>}
            </div>
            <a
              href={mapsUrl}
              target="_blank"
              rel="noreferrer"
              className="flex-none inline-flex items-center gap-1.5 rounded-btn px-3 py-2 text-[13px] font-bold bg-fill text-ink hover:bg-fill-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
              </svg>
              Navigate
            </a>
          </div>

          {/* Map peek — only when we have coordinates */}
          {hasCoords && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noreferrer"
              className="block mt-4 rounded-card overflow-hidden border border-hair focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link"
              aria-label={`Open ${stop.name} in maps`}
            >
              <img
                src={`https://staticmap.openstreetmap.de/staticmap.php?center=${stop.lat},${stop.lng}&zoom=15&size=640x180&markers=${stop.lat},${stop.lng},red-pushpin`}
                alt={`Map showing ${stop.name}`}
                loading="lazy"
                className="w-full h-[120px] object-cover bg-raised"
              />
            </a>
          )}
        </div>
      </div>

      {/* ── Content sections ─────────────────────────────────────── */}
      <div className="px-5 md:px-8 mt-6 space-y-6">
        {/* Generate / Re-generate (edit-only) */}
        {canEdit && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-muted text-[13px]">
              {hasContent
                ? 'History, facts and tips for this place.'
                : 'No details yet — let Voyager gather the story for you.'}
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
                  <p key={i} className="text-[14.5px] leading-relaxed text-ink/90">
                    {para.replace(/\n/g, ' ')}
                  </p>
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
                    <span aria-hidden="true" className="flex-none text-[15px]">
                      {['💡', '🏛️', '⭐', '🔍', '🎭', '📜'][i % 6]}
                    </span>
                    <span className="text-ink/90">{fact}</span>
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
              <p className="text-[14px] leading-relaxed bg-amber-50 dark:bg-amber-500/10 border-l-[3px] border-amber-400 rounded-r-card px-4 py-3 text-ink/90">
                {stop.tips}
              </p>
            )}
          </section>
        )}

        {/* ── Actions (edit-only) ────────────────────────────────── */}
        {canEdit && (
          <section className="pt-2 border-t border-hair">
            <h2 className="font-serif text-xl mb-3 mt-4">Edit this stop</h2>
            <div className="grid gap-4 sm:grid-cols-2">
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
              <span className="truncate">{stops[prev]?.name ?? 'Previous'}</span>
            </Link>
          ) : <span />}
          {next !== null ? (
            <Link
              to={`/trip/${trip.id}/stop/${day}/${next}`}
              className="inline-flex items-center gap-2 text-[13.5px] font-bold text-ink hover:text-sig-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link rounded-md px-2 py-1 min-w-0 text-right"
            >
              <span className="truncate">{stops[next]?.name ?? 'Next'}</span>
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
    </div>
  )
}

/**
 * Convert a stored display time (legacy stores "9:00 AM") into a 24h "HH:MM"
 * value for an <input type="time">. Returns '' when unparseable.
 */
export function toInputTime(time: string | undefined): string {
  if (!time) return ''
  const m = time.trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i)
  if (!m) return ''
  let h = Number(m[1])
  const min = m[2]
  const ap = m[3]?.toLowerCase()
  if (ap === 'pm' && h < 12) h += 12
  if (ap === 'am' && h === 12) h = 0
  return `${String(h).padStart(2, '0')}:${min}`
}

/** Convert an <input type="time"> "HH:MM" back into a "h:MM AM/PM" display string. */
export function fromInputTime(value: string): string | undefined {
  const m = value.match(/^(\d{2}):(\d{2})$/)
  if (!m) return undefined
  let h = Number(m[1])
  const min = m[2]
  const ap = h >= 12 ? 'PM' : 'AM'
  h = h % 12
  if (h === 0) h = 12
  return `${h}:${min} ${ap}`
}
