import { describe, it, expect } from 'vitest'
import { bookingStatus, setBooking, allBookings } from './booking'
import type { Stop, Trip } from '../types'

const stop = (over: Partial<Stop> = {}): Stop => ({ name: 'Place', ...over })

describe('bookingStatus', () => {
  it('returns null when the stop has no booking', () => {
    expect(bookingStatus(stop())).toBeNull()
  })

  it('reads the explicit status', () => {
    expect(bookingStatus(stop({ booking: { status: 'to_book' } }))).toBe('to_book')
    expect(bookingStatus(stop({ booking: { status: 'booked' } }))).toBe('booked')
  })
})

describe('setBooking', () => {
  it('creates a booking on a stop that had none (defaults to to_book)', () => {
    const s = stop()
    const next = setBooking(s, {})
    expect(next.booking).toEqual({ status: 'to_book' })
    // immutable: original untouched, new object returned
    expect(s.booking).toBeUndefined()
    expect(next).not.toBe(s)
  })

  it('sets an explicit status', () => {
    expect(setBooking(stop(), { status: 'booked' }).booking).toEqual({ status: 'booked' })
  })

  it('merges status while preserving existing time and note', () => {
    const s = stop({ booking: { status: 'to_book', time: '7:30 PM', note: 'table for 2' } })
    const next = setBooking(s, { status: 'booked' })
    expect(next.booking).toEqual({ status: 'booked', time: '7:30 PM', note: 'table for 2' })
    // original is untouched
    expect(s.booking).toEqual({ status: 'to_book', time: '7:30 PM', note: 'table for 2' })
  })

  it('updates time/note without losing status', () => {
    const s = stop({ booking: { status: 'booked' } })
    expect(setBooking(s, { time: '6:00 PM' }).booking).toEqual({ status: 'booked', time: '6:00 PM' })
  })

  it('clears the booking when patch is null (immutably)', () => {
    const s = stop({ booking: { status: 'booked', time: '8 PM' }, type: 'Restaurant' })
    const next = setBooking(s, null)
    expect(next.booking).toBeUndefined()
    expect('booking' in next).toBe(false)
    // other fields survive; original keeps its booking
    expect(next.type).toBe('Restaurant')
    expect(s.booking).toEqual({ status: 'booked', time: '8 PM' })
  })
})

describe('allBookings', () => {
  it('returns an empty array when nothing is booked', () => {
    const trip = { data: { days: [{ title: 'D1', stops: [stop(), stop()] }], completed: [] } } as unknown as Trip
    expect(allBookings(trip)).toEqual([])
  })

  it('handles a trip with no days at all', () => {
    expect(allBookings({ data: { days: [], completed: [] } } as unknown as Trip)).toEqual([])
    expect(allBookings({ data: undefined } as unknown as Trip)).toEqual([])
  })

  it('collects every booked stop with its day/stop index, in order', () => {
    const trip = {
      data: {
        days: [
          { title: 'D1', stops: [stop({ name: 'A' }), stop({ name: 'B', booking: { status: 'to_book' } })] },
          { title: 'D2', stops: [stop({ name: 'C', booking: { status: 'booked', time: '9 AM' } })] },
        ],
        completed: [],
      },
    } as unknown as Trip
    const result = allBookings(trip)
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ dayIndex: 0, stopIndex: 1, status: 'to_book' })
    expect(result[0].stop.name).toBe('B')
    expect(result[1]).toMatchObject({ dayIndex: 1, stopIndex: 0, status: 'booked' })
    expect(result[1].stop.name).toBe('C')
  })
})
