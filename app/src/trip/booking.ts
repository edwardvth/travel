import type { Stop, Trip } from '../types'

/** A stop's reservation, normalized. */
export type Booking = NonNullable<Stop['booking']>
/** The two booking states a stop can be in. */
export type BookingStatus = Booking['status']

/**
 * Read a stop's booking status, or `null` when the stop has no booking at all.
 * Booking is explicit — there is no "needs booking" heuristic; a stop only
 * appears in the Bookings checklist once the user marks it. Pure + unit-tested.
 */
export function bookingStatus(stop: Pick<Stop, 'booking'>): BookingStatus | null {
  return stop.booking?.status ?? null
}

/**
 * Immutably set a stop's booking. Returns a NEW stop:
 *  - `patch` partial → merged onto the existing booking (status defaults to
 *    'to_book' when there was none yet), with `time`/`note` carried forward.
 *  - `patch === null` → clears the booking entirely (returns a stop with no
 *    `booking` field).
 * Never mutates the input. Pure + unit-tested.
 */
export function setBooking(stop: Stop, patch: Partial<Booking> | null): Stop {
  if (patch === null) {
    // Strip the booking field without mutating the original.
    const { booking: _drop, ...rest } = stop
    void _drop
    return rest
  }
  const merged: Booking = {
    status: patch.status ?? stop.booking?.status ?? 'to_book',
  }
  const time = patch.time ?? stop.booking?.time
  const note = patch.note ?? stop.booking?.note
  if (time !== undefined) merged.time = time
  if (note !== undefined) merged.note = note
  return { ...stop, booking: merged }
}

/** A located booking — the stop plus where it lives in the Voyage. */
export interface BookingEntry {
  dayIndex: number
  stopIndex: number
  stop: Stop
  status: BookingStatus
}

/**
 * Walk every day/stop of a trip and collect those that carry a booking, in
 * day-then-stop order. Stops with no booking are skipped. Pure + unit-tested.
 */
export function allBookings(trip: Pick<Trip, 'data'>): BookingEntry[] {
  const out: BookingEntry[] = []
  const days = trip.data?.days ?? []
  days.forEach((day, dayIndex) => {
    ;(day?.stops ?? []).forEach((stop, stopIndex) => {
      const status = bookingStatus(stop)
      if (status) out.push({ dayIndex, stopIndex, stop, status })
    })
  })
  return out
}
