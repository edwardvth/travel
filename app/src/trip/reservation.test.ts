import { describe, it, expect } from 'vitest'
import { reservationStatus, setReservation, allReservations } from './reservation'
import type { Stop, Trip } from '../types'

const stop = (over: Partial<Stop> = {}): Stop => ({ name: 'Place', ...over })

describe('reservationStatus', () => {
  it('returns null when the stop has no reservation', () => {
    expect(reservationStatus(stop())).toBeNull()
  })

  it('reads the explicit reservation status', () => {
    expect(reservationStatus(stop({ reservation: { status: 'to_reserve' } }))).toBe('to_reserve')
    expect(reservationStatus(stop({ reservation: { status: 'reserved' } }))).toBe('reserved')
  })

  it('maps a legacy booking status (back-compat)', () => {
    expect(reservationStatus(stop({ booking: { status: 'to_book' } }))).toBe('to_reserve')
    expect(reservationStatus(stop({ booking: { status: 'booked' } }))).toBe('reserved')
  })

  it('prefers the new reservation over a stale legacy booking', () => {
    const s = stop({ reservation: { status: 'reserved' }, booking: { status: 'to_book' } })
    expect(reservationStatus(s)).toBe('reserved')
  })
})

describe('setReservation', () => {
  it('creates a reservation on a stop that had none (defaults to to_reserve)', () => {
    const s = stop()
    const next = setReservation(s, {})
    expect(next.reservation).toEqual({ status: 'to_reserve' })
    // immutable: original untouched, new object returned
    expect(s.reservation).toBeUndefined()
    expect(next).not.toBe(s)
  })

  it('sets an explicit status', () => {
    expect(setReservation(stop(), { status: 'reserved' }).reservation).toEqual({ status: 'reserved' })
  })

  it('merges status while preserving existing time, confirmation and note', () => {
    const s = stop({ reservation: { status: 'to_reserve', time: '7:30 PM', confirmation: 'ABC123', note: 'table for 2' } })
    const next = setReservation(s, { status: 'reserved' })
    expect(next.reservation).toEqual({ status: 'reserved', time: '7:30 PM', confirmation: 'ABC123', note: 'table for 2' })
    // original is untouched
    expect(s.reservation).toEqual({ status: 'to_reserve', time: '7:30 PM', confirmation: 'ABC123', note: 'table for 2' })
  })

  it('round-trips a confirmation number', () => {
    const next = setReservation(stop({ reservation: { status: 'reserved' } }), { confirmation: 'XYZ-9' })
    expect(next.reservation?.confirmation).toBe('XYZ-9')
  })

  it('updates time without losing status', () => {
    const s = stop({ reservation: { status: 'reserved' } })
    expect(setReservation(s, { time: '6:00 PM' }).reservation).toEqual({ status: 'reserved', time: '6:00 PM' })
  })

  it('migrates a legacy booking onto reservation and drops the legacy field', () => {
    const s = stop({ booking: { status: 'booked', time: '8 PM', note: 'window seat' } })
    const next = setReservation(s, { status: 'reserved' })
    expect(next.reservation).toEqual({ status: 'reserved', time: '8 PM', note: 'window seat' })
    expect('booking' in next).toBe(false)
    // original untouched
    expect(s.booking).toEqual({ status: 'booked', time: '8 PM', note: 'window seat' })
  })

  it('clears the reservation when patch is null (immutably) and removes legacy booking', () => {
    const s = stop({
      reservation: { status: 'reserved', time: '8 PM' },
      booking: { status: 'booked' },
      type: 'Restaurant',
    })
    const next = setReservation(s, null)
    expect(next.reservation).toBeUndefined()
    expect('reservation' in next).toBe(false)
    expect('booking' in next).toBe(false)
    // other fields survive; original keeps its data
    expect(next.type).toBe('Restaurant')
    expect(s.reservation).toEqual({ status: 'reserved', time: '8 PM' })
    expect(s.booking).toEqual({ status: 'booked' })
  })
})

describe('allReservations', () => {
  it('returns an empty array when nothing is reserved', () => {
    const trip = { data: { days: [{ title: 'D1', stops: [stop(), stop()] }], completed: [] } } as unknown as Trip
    expect(allReservations(trip)).toEqual([])
  })

  it('handles a trip with no days at all', () => {
    expect(allReservations({ data: { days: [], completed: [] } } as unknown as Trip)).toEqual([])
    expect(allReservations({ data: undefined } as unknown as Trip)).toEqual([])
  })

  it('collects every reserved stop with its day/stop index, in order (new + legacy)', () => {
    const trip = {
      data: {
        days: [
          { title: 'D1', stops: [stop({ name: 'A' }), stop({ name: 'B', reservation: { status: 'to_reserve' } })] },
          { title: 'D2', stops: [stop({ name: 'C', booking: { status: 'booked', time: '9 AM' } })] },
        ],
        completed: [],
      },
    } as unknown as Trip
    const result = allReservations(trip)
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ dayIndex: 0, stopIndex: 1, status: 'to_reserve' })
    expect(result[0].stop.name).toBe('B')
    // legacy booking is surfaced as a mapped 'reserved' entry
    expect(result[1]).toMatchObject({ dayIndex: 1, stopIndex: 0, status: 'reserved' })
    expect(result[1].stop.name).toBe('C')
  })
})
