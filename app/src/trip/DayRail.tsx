import { cn } from '../lib/utils'
import { dayLabel, stopCount } from './helpers'
import type { Trip } from '../types'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates, useSortable, horizontalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Plus } from 'lucide-react'

/**
 * Day selector for the itinerary — horizontal scroller on mobile, vertical
 * column on desktop. Each chip shows the day label + stop count; the active day
 * is claret. When `canEdit`, chips gain a grip handle to drag-reorder (dnd-kit,
 * consistent with stop reorder) and an "Add day" chip appends a day. Selection,
 * reorder and add are all driven by the parent (immutable saves upstream).
 */
export function DayRail({ trip, activeDay, onSelect, canEdit = false, onReorder, onAddDay, exitingDay }: {
  trip: Trip
  activeDay: number
  onSelect: (day: number) => void
  canEdit?: boolean
  /** Reorder the day at `from` to `to` (edit only). */
  onReorder?: (from: number, to: number) => void
  /** Append a new day (edit only). */
  onAddDay?: () => void
  /** Day index currently animating out (collapse) just before its removal. */
  exitingDay?: number | null
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const count = trip.data?.days?.length || trip.config?.numDays || 0
  // Nothing to select with ≤1 day; still offer "Add day" to edit-capable users.
  if (count <= 1 && !canEdit) return null
  const days = Array.from({ length: count }, (_, i) => i)

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    onReorder?.(Number(active.id), Number(over.id))
  }

  const railClass = cn(
    'flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none',
    'md:flex-col md:overflow-visible md:mx-0 md:px-0 md:pb-0 md:sticky md:top-4',
  )

  const addChip = canEdit && onAddDay ? (
    <button
      type="button"
      onClick={onAddDay}
      aria-label="Add a day"
      className="flex-none md:w-full inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3.5 rounded-btn border border-dashed border-hair-strong text-muted hover:text-ink hover:bg-fill transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link"
    >
      <Plus size={15} aria-hidden="true" />
      <span className="font-sans font-bold text-[13px] whitespace-nowrap">Add day</span>
    </button>
  ) : null

  if (!canEdit) {
    return (
      <nav aria-label="Trip days" className={railClass}>
        {days.map(day => <DayChip key={day} trip={trip} day={day} active={day === activeDay} onSelect={onSelect} />)}
      </nav>
    )
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <nav aria-label="Trip days" className={railClass}>
        <SortableContext items={days} strategy={horizontalListSortingStrategy}>
          {days.map(day => <SortableDayChip key={day} trip={trip} day={day} active={day === activeDay} onSelect={onSelect} exiting={day === exitingDay} />)}
        </SortableContext>
        {addChip}
      </nav>
    </DndContext>
  )
}

/** The chip's label + stop-count, shared by the static and sortable variants. */
function ChipBody({ trip, day, active }: { trip: Trip; day: number; active: boolean }) {
  return (
    <>
      <span className="font-sans font-bold text-[13.5px] whitespace-nowrap">{dayLabel(trip, day)}</span>
      <span
        className={cn(
          'inline-grid place-items-center min-w-[22px] h-[22px] px-1.5 rounded-full text-[11px] font-bold font-mono',
          active ? 'bg-white/20 text-white' : 'bg-base text-muted',
        )}
      >
        {stopCount(trip, day)}
      </span>
    </>
  )
}

const chipClass = (active: boolean) =>
  cn(
    'flex-none md:w-full inline-flex items-center justify-between gap-3 min-h-[44px] px-3.5 rounded-btn text-left transition-colors',
    'motion-safe:animate-[dayChipIn_220ms_ease-out]',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link',
    active ? 'bg-sig-btn text-white' : 'bg-fill text-ink hover:bg-fill-hover',
  )

function DayChip({ trip, day, active, onSelect }: { trip: Trip; day: number; active: boolean; onSelect: (d: number) => void }) {
  return (
    <button type="button" onClick={() => onSelect(day)} aria-current={active ? 'true' : undefined} className={chipClass(active)}>
      <ChipBody trip={trip} day={day} active={active} />
    </button>
  )
}

function SortableDayChip({ trip, day, active, onSelect, exiting }: { trip: Trip; day: number; active: boolean; onSelect: (d: number) => void; exiting?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: day })
  const style = {
    transform: CSS.Transform.toString(transform),
    // Collapsing out needs its own transition — dnd's `transition` only covers transform.
    transition: exiting ? 'max-width 230ms ease, opacity 230ms ease, padding 230ms ease' : transition,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex-none md:w-full inline-flex items-center gap-1 rounded-btn min-h-[44px] pr-2',
        'motion-safe:animate-[dayChipIn_220ms_ease-out]',
        active ? 'bg-sig-btn text-white' : 'bg-fill text-ink',
        isDragging && 'opacity-60 z-10',
        exiting ? 'max-w-0 opacity-0 overflow-hidden pointer-events-none !pr-0' : 'max-w-[220px]',
      )}
    >
      <button
        type="button"
        aria-label={`Reorder ${dayLabel(trip, day)}`}
        className={cn(
          'grid place-items-center w-6 h-9 rounded-md cursor-grab active:cursor-grabbing touch-none',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link',
          active ? 'text-white/70 hover:text-white' : 'text-muted/60 hover:text-muted',
        )}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={14} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => onSelect(day)}
        aria-current={active ? 'true' : undefined}
        className="flex-1 inline-flex items-center justify-between gap-3 min-h-[44px] pr-1.5 text-left rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link"
      >
        <ChipBody trip={trip} day={day} active={active} />
      </button>
    </div>
  )
}
