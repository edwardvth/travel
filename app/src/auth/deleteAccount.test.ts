// app/src/auth/deleteAccount.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/supabase', () => ({
  supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'tok' } } }) } },
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
}))

import { requestAccountDeletion } from './deleteAccount'

beforeEach(() => { vi.restoreAllMocks() })

describe('requestAccountDeletion', () => {
  it('returns ok on 200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, summary: {} }), { status: 200 })))
    expect(await requestAccountDeletion()).toEqual({ ok: true })
  })

  it('maps 401 to unauthorized', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })))
    const r = await requestAccountDeletion()
    expect(r.ok).toBe(false)
    expect(r).toMatchObject({ code: 'unauthorized' })
  })

  it('maps auth_delete_failed (data removed, retryable)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'auth_delete_failed' }), { status: 500 })))
    const r = await requestAccountDeletion()
    expect(r).toMatchObject({ ok: false, code: 'auth_delete_failed' })
  })

  it('maps other failures to error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'db_failed' }), { status: 500 })))
    const r = await requestAccountDeletion()
    expect(r).toMatchObject({ ok: false, code: 'error' })
  })
})
