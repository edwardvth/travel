import { describe, it, expect } from 'vitest'
import { decideAction, GEN } from './decide'
import type { CacheRow } from './types'

const base = (over: Partial<CacheRow>): CacheRow => ({
  place_id: 'p', prompt_version: 2, generation_status: 'ready',
  generation_started_at: '2026-06-24T00:00:00Z', generation_attempts: 1, ...over,
} as CacheRow)
const NOW = Date.parse('2026-06-24T00:00:30Z') // 30s after the base timestamp

describe('decideAction', () => {
  it('no row → claim', () => {
    expect(decideAction(null, NOW).kind).toBe('claim')
  })
  it('ready → serve', () => {
    expect(decideAction(base({ generation_status: 'ready' }), NOW).kind).toBe('serve')
  })
  it('unsupported → unsupported (terminal)', () => {
    expect(decideAction(base({ generation_status: 'unsupported' }), NOW).kind).toBe('unsupported')
  })
  it('generating within lease → pending', () => {
    expect(decideAction(base({ generation_status: 'generating' }), NOW).kind).toBe('pending')
  })
  it('generating past lease → reclaim', () => {
    const old = base({ generation_status: 'generating', generation_started_at: '2026-06-24T00:00:00Z' })
    const later = Date.parse('2026-06-24T00:02:00Z') // 120s > 60s lease
    expect(decideAction(old, later).kind).toBe('reclaim')
  })
  it('failed within cooldown → failed', () => {
    const r = base({ generation_status: 'failed', generation_started_at: '2026-06-24T00:00:00Z' })
    expect(decideAction(r, NOW).kind).toBe('failed')
  })
  it('failed past cooldown, under max attempts → claim (retry)', () => {
    const r = base({ generation_status: 'failed', generation_started_at: '2026-06-24T00:00:00Z', generation_attempts: 2 })
    const later = Date.parse('2026-06-24T00:10:00Z') // 600s > 300s cooldown
    expect(decideAction(r, later).kind).toBe('claim')
  })
  it('failed and at max attempts → failed (founder-only retry)', () => {
    const r = base({ generation_status: 'failed', generation_started_at: '2026-06-24T00:00:00Z', generation_attempts: GEN.MAX_ATTEMPTS })
    const later = Date.parse('2026-06-24T01:00:00Z')
    expect(decideAction(r, later).kind).toBe('failed')
  })
})
