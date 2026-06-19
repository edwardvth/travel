import { useEffect, useRef } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useNavigate } from 'react-router-dom'
import { cn } from '../lib/utils'
import { Calendar, Check, CheckCircle2, ChevronRight, Circle, GripVertical, Trash2, kindIcon, kindLabel, stopKind } from './icons'
import { bookingStatus, type Booking } from './booking'
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
  /** Set or clear this stop's booking (immutable, edit-gated upstream). */
  onSetBooking?: (index: number, patch: Partial<Booking> | null) => void
}

/**
 * A dense, sortable itinerary row. The row body selects the stop (focusing the
 * map); an explicit "details" chevron opens the stop detail page. Edit
 * affordances (drag handle, done toggle, delete) are hidden when `!canEdit`.
 */
export function StopRow({
  tripId, day, index, stop, done, canEdit, selected = false, onSelect, onToggleDone, onDelete, onSetBooking,
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

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const kind = stopKind(stop)
  const KindIcon = kindIcon(kind)
  const booking = bookingStatus(stop)
  const bookingTime = stop.booking?.time

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

      {/* Tappable body → select stop (focuses the map) */}
      <button
        type="button"
        onClick={() => onSelect?.(index)}
        className="flex-1 min-w-0 flex items-center gap-3 text-left rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link"
      >
        {/* Thumbnail */}
        {stop.image ? (
          <img
            src={stop.image}
            alt=""
            loading="lazy"
            className="flex-none w-11 h-11 rounded-[10px] object-cover bg-raised"
          />
        ) : (
          <span className="flex-none grid place-items-center w-11 h-11 rounded-[10px] bg-fill text-muted" aria-hidden="true">
            <KindIcon size={18} />
          </span>
        )}

        <span className="min-w-0 flex-1">
          <span className={cn(
            'block font-sans font-semibold text-[14.5px] truncate',
            done && 'line-through text-muted',
          )}>
            {stop.name}
          </span>
          <span className="flex items-center gap-1.5 text-[12px] text-muted truncate">
            <span
              className="flex-none inline-flex items-center gap-1 rounded-full bg-fill px-1.5 py-0.5 text-[10.5px] font-semibold text-muted"
            >
              <KindIcon size={11} aria-hidden="true" />
              {kindLabel(kind)}
            </span>
            <span className="truncate">
              {[stop.time, stop.type].filter(Boolean).join(' · ') || 'Tap to add details'}
            </span>
          </span>
        </span>
      </button>

      {/* Booking affordance — explicit, edit-gated. Read-only viewers see the
          state but get no interactive control. */}
      {booking === 'to_book' ? (
        canEdit ? (
          <button
            type="button"
            aria-label={`Mark ${stop.name} booked`}
            onClick={() => onSetBooking?.(index, { status: 'booked' })}
            className="flex-none inline-flex items-center gap-1 rounded-full min-h-[28px] pl-2 pr-2.5 text-[11px] font-bold text-amber-700 dark:text-amber-300 bg-amber-400/15 hover:bg-amber-400/25 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link"
          >
            <Calendar size={12} aria-hidden="true" />
            To book
          </button>
        ) : (
          <span className="flex-none inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold text-amber-700 dark:text-amber-300 bg-amber-400/15">
            <Calendar size={12} aria-hidden="true" />
            To book
          </span>
        )
      ) : booking === 'booked' ? (
        canEdit ? (
          <button
            type="button"
            aria-label={`Booked${bookingTime ? ` at ${bookingTime}` : ''} — mark ${stop.name} to book again`}
            onClick={() => onSetBooking?.(index, { status: 'to_book' })}
            className="flex-none inline-flex items-center gap-1 rounded-full min-h-[28px] pl-1.5 pr-2 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link"
          >
            <CheckCircle2 size={13} aria-hidden="true" />
            {bookingTime ? `Booked · ${bookingTime}` : 'Booked'}
          </button>
        ) : (
          <span className="flex-none inline-flex items-center gap-1 rounded-full px-1.5 py-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 size={13} aria-hidden="true" />
            {bookingTime ? `Booked · ${bookingTime}` : 'Booked'}
          </span>
        )
      ) : canEdit ? (
        <button
          type="button"
          aria-label={`Add ${stop.name} to bookings`}
          title="Add to bookings"
          onClick={() => onSetBooking?.(index, { status: 'to_book' })}
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
