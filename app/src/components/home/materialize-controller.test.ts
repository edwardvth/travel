import { describe, it, expect, vi, beforeEach } from 'vitest'
import { materialize } from './materialize-controller'

const payload = { destination: 'Kyoto, Japan', rangeLabel: 'Jul 14 → Jul 18', coverUrl: null, sourceRect: null }

beforeEach(() => materialize.reset())

describe('materialize controller', () => {
  it('begin → flying with payload; arrive → arrived; reset → idle/null', () => {
    expect(materialize.status).toBe('idle')
    materialize.begin(payload)
    expect(materialize.status).toBe('flying')
    expect(materialize.payload?.destination).toBe('Kyoto, Japan')
    materialize.arrive()
    expect(materialize.status).toBe('arrived')
    materialize.reset()
    expect(materialize.status).toBe('idle')
    expect(materialize.payload).toBeNull()
  })
  it('arrive is a no-op unless flying', () => {
    materialize.arrive()
    expect(materialize.status).toBe('idle')
  })
  it('fail only transitions from flying', () => {
    materialize.fail()
    expect(materialize.status).toBe('idle')
    materialize.begin(payload)
    materialize.fail()
    expect(materialize.status).toBe('failed')
  })
  it('notifies subscribers and stops after unsubscribe', () => {
    const cb = vi.fn()
    const unsub = materialize.subscribe(cb)
    materialize.begin(payload)
    expect(cb).toHaveBeenCalled()
    const before = cb.mock.calls.length
    unsub()
    materialize.reset()
    expect(cb.mock.calls.length).toBe(before)
  })
})
