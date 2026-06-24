import { useEffect, useRef, useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useNavigate } from 'react-router-dom'
import { cn } from '../lib/utils'
import { Calendar, Check, CheckCircle2, ChevronRight, Circle, Clock, GripVertical, Trash2, kindIcon, kindLabel, stopKind } from './icons'
import { reservationStatus, type Reservation } from './reservation'
import { coverPhoto } from './photo'
import { useHeroImage } from '../data/useLandmarkImage'
import { heroQueries } from './landmark-context'
import { AnimatePresence } from 'framer-motion'
import { TimeEditor } from './TimeEditor'
import { TimeModal } from './TimeModal'
import { useMediaQuery } from '../lib/useMediaQuery'
import type { Stop } from '../types'

export interface StopRowProps {
  tripId: string
  day: number
  index: number
  stop: Stop
  done: boolean
  canEdit: boolean
  /** True when this row is the selected stop (synced with the map). */
  selected?: boolean
  /** Select this stop → focuses the map on its marker. */
  onSelect?: (index: number) => void
  onToggleDone: (index: number) => void
  onDelete: (index: number) => void
  /** Set or clear this stop's reservation (immutable, edit-gated upstream). */
  onSetReservation?: (index: number, patch: Partial<Reservation> | null) => void
  /** Set or clear this stop's display time (immutable, edit-gated upstream). */
  onSetTime?: (index: number, time: string | undefined) => void
  /** Trip destination context — lets a coverless stop resolve a Wikipedia thumb. */
  destination?: string
}

/**
 * A dense, sortable itinerary row. The row body selects the stop (focusing the
 * map); an explicit "details" chevron opens the stop detail page. Edit
 * affordances (drag handle, done toggle, delete) are hidden when `!canEdit`.
 */
export function StopRow({
  tripId, day, index, stop, done, canEdit, selected = false, onSelect, onToggleDone, onDelete, onSetReservation, onSetTime, destination,
}: StopRowProps) {
  const navigate = useNavigate()
  const rowRef = useRef<HTMLDivElement | null>(null)
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: index, disabled: !canEdit })

  // When selected from the map, scroll this row into view.
  useEffect(() => {
    if (selected) rowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selected])

  // Inline time editor: open state. The desktop popover closes on Esc /
  // pointer-down outside it; the mobile bottom sheet manages its own dismissal.
  const [editingTime, setEditingTime] = useState(false)
  const timeWrapRef = useRef<HTMLSpanElement | null>(null)
  const isDesktop = useMediaQuery('(min-width: 768px)')
  useEffect(() => {
    if (!editingTime || !isDesktop) return
    const onDown = (e: PointerEvent) => {
      if (timeWrapRef.current && !timeWrapRef.current.contains(e.target as Node)) setEditingTime(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEditingTime(false)
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [editingTime, isDesktop])

  // Baseline for "back to suggested": prefer the AI-captured suggestion, else
  // snapshot the time once when the editor first opens — so pre-existing stops
  // (generated before suggestedTime existed) can still be reverted.
  const suggestedTimeRef = useRef<string | undefined>(undefined)
  function toggleTimeEditor() {
    setEditingTime((prev) => {
      const opening = !prev
      if (opening) suggestedTimeRef.current = stop.suggestedTime ?? suggestedTimeRef.current ?? stop.time
      return opening
    })
  }

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const kind = stopKind(stop)
  const KindIcon = kindIcon(kind)
  const reservation = reservationStatus(stop)
  const reservationTime = stop.reservation?.time ?? stop.booking?.time
  // Cover photo first; otherwise resolve the same on-demand Wikipedia image
  // Guide uses (shared TanStack cache → no refetch across Plan/Guide/detail).
  const storedThumb = coverPhoto(stop)
  const { url: landmarkThumb } = useHeroImage(storedThumb ? [] : heroQueries(stop.name, destination ?? ''))
  const thumb = storedThumb ?? landmarkThumb

  return (
    <div
      ref={(node) => {
        setNodeRef(node)
        rowRef.current = node
      }}
      style={style}
      aria-selected={selected}
      className={cn(
        'group relative flex items-center gap-3 py-2.5 pr-1 px-2 -mx-2 rounded-card transition-[background-color,box-shadow] duration-200',
        selected && 'bg-sig/8 ring-2 ring-inset ring-sig/45 shadow-[0_0_0_3px_rgba(139,41,66,0.10)]',
        isDragging && 'opacity-50 z-10',
      )}
    >
      {/* Drag handle — edit only */}
      {canEdit && (
        <button
          type="button"
          aria-label={`Reorder ${stop.name}`}
          className="flex-none grid place-items-center w-6 h-9 -ml-1 text-muted/60 hover:text-muted cursor-grab active:cursor-grabbing touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link rounded-md"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} aria-hidden="true" />
        </button>
      )}

      {/* Done check — edit only writes; view-only shows static state */}
      {canEdit ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-label={done ? `Mark ${stop.name} not done` : `Mark ${stop.name} done`}
          onClick={() => onToggleDone(index)}
          className={cn(
            'flex-none grid place-items-center w-5 h-5 rounded-full border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link',
            done ? 'bg-sig-btn border-sig-btn text-white' : 'border-hair-strong text-transparent hover:border-muted',
          )}
        >
          <Check size={11} strokeWidth={3.5} aria-hidden="true" />
        </button>
      ) : (
        <span
          aria-hidden="true"
          className={cn(
            'flex-none grid place-items-center w-5 h-5 rounded-full border-2',
            done ? 'bg-sig-btn border-sig-btn text-white' : 'border-hair text-transparent',
          )}
        >
          <Check size={11} strokeWidth={3.5} aria-hidden="true" />
        </span>
      )}

      {/* Body: thumbnail + name select the stop (focus the map). The time pill
          under the name is its OWN button — separate, never nested — so it can
          open the inline TimeEditor without an invalid button-in-button. */}
      <div className="flex-1 min-w-0 flex items-center gap-3">
        <button
          type="button"
          onClick={() => onSelect?.(index)}
          aria-label={`Focus ${stop.name} on the map`}
          className="flex-none rounded-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link"
        >
          {thumb ? (
            <img
              src={thumb}
              alt=""
              loading="lazy"
              className="w-11 h-11 rounded-[10px] object-cover bg-raised"
            />
          ) : (
            <span className="grid place-items-center w-11 h-11 rounded-[10px] bg-fill text-muted" aria-hidden="true">
              <KindIcon size={18} />
            </span>
          )}
        </button>

        <span className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => onSelect?.(index)}
            className="block w-full text-left rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link"
          >
            <span className={cn(
              'block font-sans font-semibold text-[14.5px] truncate',
              done && 'line-through text-muted',
            )}>
              {stop.name}
            </span>
          </button>

          <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-muted">
            <span className="flex-none inline-flex items-center gap-1 rounded-full bg-fill px-1.5 py-0.5 text-[10.5px] font-semibold text-muted">
              <KindIcon size={11} aria-hidden="true" />
              {kindLabel(kind)}
            </span>

            {/* Editable time pill → opens the inline TimeEditor (edit only). */}
            <span ref={timeWrapRef} className="relative flex-none">
              {canEdit ? (
                <button
                  type="button"
                  onClick={toggleTimeEditor}
                  aria-label={stop.time ? `Edit time (${stop.time})` : 'Add a time'}
                  aria-expanded={editingTime}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full min-h-[28px] pl-1.5 pr-2 font-mono text-[11.5px] tabular-nums transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link',
                    editingTime
                      ? 'bg-sig/10 text-sig-link'
                      : stop.time
                        ? 'text-muted hover:bg-fill hover:text-ink'
                        : 'text-muted/70 hover:bg-fill hover:text-ink',
                  )}
                >
                  <Clock size={11} aria-hidden="true" />
                  {stop.time ?? 'Add time'}
                </button>
              ) : stop.time ? (
                <span className="inline-flex items-center gap-1 font-mono text-[11.5px] tabular-nums text-muted">
                  <Clock size={11} aria-hidden="true" />
                  {stop.time}
                </span>
              ) : null}

              {isDesktop
                ? editingTime && (
                    <TimeEditor
                      value={stop.time}
                      suggested={suggestedTimeRef.current}
                      onChange={t => onSetTime?.(index, t)}
                      onClear={() => onSetTime?.(index, undefined)}
                      onClose={() => setEditingTime(false)}
                    />
                  )
                : (
                    <AnimatePresence>
                      {editingTime && (
                        <TimeModal
                          key="time-modal"
                          value={stop.time}
                          suggested={suggestedTimeRef.current}
                          onChange={t => onSetTime?.(index, t)}
                          onClear={() => onSetTime?.(index, undefined)}
                          onClose={() => setEditingTime(false)}
                        />
                      )}
                    </AnimatePresence>
                  )}
            </span>

            {stop.type && <span className="min-w-0 truncate">{stop.type}</span>}
          </span>
        </span>
      </div>

      {/* Reservation affordance — explicit, edit-gated. Read-only viewers see the
          state but get no interactive control. */}
      {reservation === 'to_reserve' ? (
        canEdit ? (
          <button
            type="button"
            aria-label={`Mark ${stop.name} reserved`}
            onClick={() => onSetReservation?.(index, { status: 'reserved' })}
            className="flex-none inline-flex items-center gap-1 rounded-full min-h-[28px] pl-2 pr-2.5 text-[11px] font-bold text-amber-700 dark:text-amber-300 bg-amber-400/15 hover:bg-amber-400/25 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link"
          >
            <Calendar size={12} aria-hidden="true" />
            Need to reserve
          </button>
        ) : (
          <span className="flex-none inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold text-amber-700 dark:text-amber-300 bg-amber-400/15">
            <Calendar size={12} aria-hidden="true" />
            Need to reserve
          </span>
        )
      ) : reservation === 'reserved' ? (
        canEdit ? (
          <button
            type="button"
            aria-label={`Reserved${reservationTime ? ` at ${reservationTime}` : ''} — mark ${stop.name} as need to reserve again`}
            onClick={() => onSetReservation?.(index, { status: 'to_reserve' })}
            className="flex-none inline-flex items-center gap-1 rounded-full min-h-[28px] pl-1.5 pr-2 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link"
          >
            <CheckCircle2 size={13} aria-hidden="true" />
            {reservationTime ? `Reserved · ${reservationTime}` : 'Reserved'}
          </button>
        ) : (
          <span className="flex-none inline-flex items-center gap-1 rounded-full px-1.5 py-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 size={13} aria-hidden="true" />
            {reservationTime ? `Reserved · ${reservationTime}` : 'Reserved'}
          </span>
        )
      ) : canEdit ? (
        <button
          type="button"
          aria-label={`Add ${stop.name} to reservations`}
          title="Add to reservations"
          onClick={() => onSetReservation?.(index, { status: 'to_reserve' })}
          className="flex-none grid place-items-center w-8 h-8 rounded-md text-muted/50 hover:text-ink hover:bg-fill opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-[opacity,color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link"
        >
          <Circle size={15} aria-hidden="true" />
        </button>
      ) : null}

      {/* Details affordance → stop detail page */}
      <button
        type="button"
        aria-label={`Open details for ${stop.name}`}
        onClick={() => navigate(`/trip/${tripId}/stop/${day}/${index}`)}
        className="flex-none grid place-items-center w-8 h-8 rounded-md text-muted/60 hover:text-ink hover:bg-fill transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link"
      >
        <ChevronRight size={18} aria-hidden="true" />
      </button>

      {/* Delete — edit only */}
      {canEdit && (
        <button
          type="button"
          aria-label={`Remove ${stop.name}`}
          onClick={() => onDelete(index)}
          className="flex-none grid place-items-center w-8 h-8 rounded-md text-muted/50 hover:text-sig opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link"
        >
          <Trash2 size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
