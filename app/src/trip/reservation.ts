import type { Stop, Trip } from '../types'

/** A stop's reservation, normalized. */
export type Reservation = NonNullable<Stop['reservation']>
/** The two reservation states a stop can be in. */
export type ReservationStatus = Reservation['status']

/** Map a legacy `booking.status` onto the current reservation vocabulary. */
function fromLegacy(status: 'to_book' | 'booked'): ReservationStatus {
  return status === 'booked' ? 'reserved' : 'to_reserve'
}

/**
 * Read a stop's reservation status, or `null` when the stop has no reservation
 * at all. Reservations are explicit — there is no heuristic; a stop only appears
 * in the reservations checklist once the user marks it.
 *
 * Reads `stop.reservation` first; falls back to a legacy `stop.booking`
 * (`to_book`→`to_reserve`, `booked`→`reserved`) so old trips still display.
 * Pure + unit-tested.
 */
export function reservationStatus(
  stop: Pick<Stop, 'reservation' | 'booking'>,
): ReservationStatus | null {
  if (stop.reservation) return stop.reservation.status
  if (stop.booking) return fromLegacy(stop.booking.status)
  return null
}

/**
 * Immutably set a stop's reservation. Returns a NEW stop:
 *  - `patch` partial → merged onto the existing reservation (status defaults to
 *    'to_reserve' when there was none yet), carrying `time`/`confirmation`/`note`
 *    forward. Legacy values are read as a fallback so a half-migrated stop keeps
 *    its details. Writing a reservation drops the legacy `booking` field to
 *    avoid drift between the two.
 *  - `patch === null` → clears the reservation entirely AND removes any legacy
 *    `booking`, so a cleared stop is truly clear.
 * Never mutates the input. Pure + unit-tested.
 */
export function setReservation(stop: Stop, patch: Partial<Reservation> | null): Stop {
  if (patch === null) {
    // Strip both the new and the legacy field without mutating the original.
    const { reservation: _r, booking: _b, ...rest } = stop
    void _r
    void _b
    return rest
  }
  const legacyStatus = stop.booking ? fromLegacy(stop.booking.status) : undefined
  const merged: Reservation = {
    status: patch.status ?? stop.reservation?.status ?? legacyStatus ?? 'to_reserve',
  }
  const time = patch.time ?? stop.reservation?.time ?? stop.booking?.time
  const confirmation = patch.confirmation ?? stop.reservation?.confirmation
  const note = patch.note ?? stop.reservation?.note ?? stop.booking?.note
  if (time !== undefined) merged.time = time
  if (confirmation !== undefined) merged.confirmation = confirmation
  if (note !== undefined) merged.note = note
  // Drop any legacy `booking` so the reservation is the single source of truth.
  const { booking: _drop, ...rest } = stop
  void _drop
  return { ...rest, reservation: merged }
}

/** A located reservation — the stop plus where it lives in the Voyage. */
export interface ReservationEntry {
  dayIndex: number
  stopIndex: number
  stop: Stop
  status: ReservationStatus
}

/**
 * Walk every day/stop of a trip and collect those that carry a reservation, in
 * day-then-stop order (reading legacy `booking` too). Stops with no reservation
 * are skipped. Pure + unit-tested.
 */
export function allReservations(trip: Pick<Trip, 'data'>): ReservationEntry[] {
  const out: ReservationEntry[] = []
  const days = trip.data?.days ?? []
  days.forEach((day, dayIndex) => {
    ;(day?.stops ?? []).forEach((stop, stopIndex) => {
      const status = reservationStatus(stop)
      if (status) out.push({ dayIndex, stopIndex, stop, status })
    })
  })
  return out
}
