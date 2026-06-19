import { useState } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { StopRow } from './StopRow'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Footprints } from './icons'
import { stopCoords, walkMinutes, formatWalk } from './walk'
import { isCompleted } from './helpers'
import {
  remapCompletedAfterReorder,
  remapCompletedAfterDelete,
  toggleCompleted,
} from './itinerary-helpers'
import { setBooking, type Booking } from './booking'
import type { Trip, TripData } from '../types'

/**
 * Dense, scannable list of the active day's stops with drag-reorder,
 * mark-done, and delete. All mutations are immutable and persisted via `save`.
 */
export function StopList({ trip, day, canEdit, save, selectedIndex, onSelect }: {
  trip: Trip
  day: number
  canEdit: boolean
  save: (partial: { data: TripData }) => void
  /** Index of the selected stop on this day (synced with the map), if any. */
  selectedIndex?: number | null
  /** Select a stop on this day → focuses the map on it. */
  onSelect?: (index: number) => void
}) {
  const stops = trip.data?.days?.[day]?.stops ?? []
  const [pendingDelete, setPendingDelete] = useState<number | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  /** Clone `data.days` so we never mutate the cached query object. */
  function cloneData(): TripData {
    const data = trip.data
    return {
      ...data,
      days: data.days.map((d, i) =>
        i === day ? { ...d, stops: d.stops.slice() } : d,
      ),
    }
  }

  function handleDragEnd(e: DragEndEvent) {
    if (!canEdit) return
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = Number(active.id)
    const to = Number(over.id)
    if (Number.isNaN(from) || Number.isNaN(to)) return

    const data = cloneData()
    data.days[day].stops = arrayMove(data.days[day].stops, from, to)
    // arrayMove on the *indices* gives the old-index order for remapping completed.
    const order = arrayMove(stops.map((_, i) => i), from, to)
    data.completed = remapCompletedAfterReorder(trip.data?.completed, day, order)
    save({ data })
  }

  function handleToggleDone(index: number) {
    if (!canEdit) return
    const data = cloneData()
    data.completed = toggleCompleted(trip.data?.completed, day, index)
    save({ data })
  }

  function handleSetBooking(index: number, patch: Partial<Booking> | null) {
    if (!canEdit) return
    const data = cloneData()
    const current = data.days[day].stops[index]
    if (!current) return
    data.days[day].stops[index] = setBooking(current, patch)
    save({ data })
  }

  function handleConfirmDelete() {
    if (!canEdit || pendingDelete === null) return
    const index = pendingDelete
    const data = cloneData()
    data.days[day].stops.splice(index, 1)
    data.completed = remapCompletedAfterDelete(trip.data?.completed, day, index)
    save({ data })
    setPendingDelete(null)
  }

  const deleteName = pendingDelete !== null ? stops[pendingDelete]?.name : ''

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={stops.map((_, i) => i)} strategy={verticalListSortingStrategy}>
          <ul className="divide-y divide-hair" role="list">
            {stops.map((stop, i) => {
              // Subtle walk-time connector before this row, when both this stop
              // and the previous one have coords. Non-sortable separator: it sits
              // in the list but is not a SortableContext item, so dnd is untouched.
              const prev = i > 0 ? stops[i - 1] : null
              const a = prev ? stopCoords(prev) : null
              const b = stopCoords(stop)
              const connector =
                a && b ? (
                  <li
                    key={`walk-${i}`}
                    aria-hidden="true"
                    className="flex items-center gap-1.5 pl-1.5 py-0.5 text-[11.5px] text-muted/70"
                  >
                    <Footprints size={12} className="shrink-0 opacity-70" />
                    <span>{formatWalk(walkMinutes(a, b))}</span>
                  </li>
                ) : null

              return [
                connector,
                <li key={i}>
                  <StopRow
                    tripId={trip.id}
                    day={day}
                    index={i}
                    stop={stop}
                    done={isCompleted(trip.data?.completed, day, i)}
                    canEdit={canEdit}
                    selected={selectedIndex === i}
                    onSelect={onSelect}
                    onToggleDone={handleToggleDone}
                    onDelete={setPendingDelete}
                    onSetBooking={handleSetBooking}
                  />
                </li>,
              ]
            })}
          </ul>
        </SortableContext>
      </DndContext>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Remove stop?"
        body={`"${deleteName ?? ''}" will be removed from this day. This can’t be undone.`}
        confirmLabel="Remove"
        onCancel={() => setPendingDelete(null)}
        onConfirm={handleConfirmDelete}
      />
    </>
  )
}
