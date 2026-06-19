import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/supabase', () => ({
  SUPABASE_URL: 'https://proj.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key-123',
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { access_token: 'tok-abc' } } })),
    },
  },
}))

import { callAI, textMessage } from './ai'
import { supabase } from '../lib/supabase'

describe('textMessage', () => {
  it('builds a single user message', () => {
    expect(textMessage('hello')).toEqual([{ role: 'user', content: 'hello' }])
  })
})

describe('callAI', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    ;(supabase.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { session: { access_token: 'tok-abc' } },
    })
  })

  it('posts to ai-proxy with the right URL, headers and body', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ content: [{ text: 'the answer' }] }),
    })) as unknown as typeof fetch
    vi.stubGlobal('fetch', fetchMock)

    const out = await callAI(textMessage('hi'), { maxTokens: 256 })
    expect(out).toBe('the answer')

    const [url, init] = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('https://proj.supabase.co/functions/v1/ai-proxy')
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer tok-abc',
      apikey: 'anon-key-123',
    })
    expect(JSON.parse(init.body)).toEqual({
      messages: [{ role: 'user', content: 'hi' }],
      model: 'claude-sonnet-4-6',
      max_tokens: 256,
    })
  })

  it('falls back to the anon key when there is no session', async () => {
    ;(supabase.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { session: null } })
    const fetchMock = vi.fn(async () => ({
      ok: true, status: 200, json: async () => ({ content: [{ text: 'x' }] }),
    })) as unknown as typeof fetch
    vi.stubGlobal('fetch', fetchMock)

    await callAI(textMessage('hi'))
    const [, init] = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(init.headers.Authorization).toBe('Bearer anon-key-123')
  })

  it('returns empty string when content is missing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })) as unknown as typeof fetch)
    expect(await callAI(textMessage('hi'))).toBe('')
  })

  it('throws a friendly error on non-ok', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false, status: 500, text: async () => 'boom',
    })) as unknown as typeof fetch)
    await expect(callAI(textMessage('hi'))).rejects.toThrow(/AI request failed \(500\)/)
  })
})
