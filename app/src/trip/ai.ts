import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../lib/supabase'

export interface AIMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface CallAIOptions {
  model?: string
  maxTokens?: number
}

const DEFAULT_MODEL = 'claude-sonnet-4-6'
const DEFAULT_MAX_TOKENS = 1024

/** Build a single-message user payload — the common case. Pure, unit-tested. */
export function textMessage(text: string): AIMessage[] {
  return [{ role: 'user', content: text }]
}

/** Resolve the bearer token for ai-proxy: the session access token, or the anon key. */
async function authToken(): Promise<string> {
  try {
    const { data } = await supabase.auth.getSession()
    if (data?.session?.access_token) return data.session.access_token
  } catch {
    /* fall through to anon key */
  }
  return SUPABASE_ANON_KEY
}

/**
 * Call the shared `ai-proxy` Edge Function and return the assistant's text.
 * Mirrors Trip.html's _callClaude → ai-proxy path. Throws a friendly Error on failure.
 */
export async function callAI(messages: AIMessage[], opts?: CallAIOptions): Promise<string> {
  const url = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/ai-proxy`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + (await authToken()),
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      messages,
      model: opts?.model ?? DEFAULT_MODEL,
      max_tokens: opts?.maxTokens ?? DEFAULT_MAX_TOKENS,
    }),
  })

  if (res.status === 429) {
    throw new Error('Daily AI limit reached — try again tomorrow.')
  }
  if (!res.ok) {
    let detail = ''
    try {
      detail = (await res.text()).slice(0, 200)
    } catch {
      /* ignore */
    }
    throw new Error(`AI request failed (${res.status})${detail ? ': ' + detail : ''}`)
  }

  const json = await res.json()
  return json.content?.[0]?.text ?? ''
}
