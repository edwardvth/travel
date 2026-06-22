// supabase/functions/ai-proxy/index.ts
//
// Server-side proxy to the Claude (Anthropic) API. The AI key lives ONLY here
// (env secret ANTHROPIC_API_KEY) — never in the client. The web app calls this
// for AI place suggestions (Plan) and stop enrichment (Guide) via `app/src/trip/ai.ts`.
//
// Contract (matches app/src/trip/ai.ts → callAI):
//   POST { messages: [{role,content}], model?, max_tokens? }
//   Authorization: Bearer <supabase session access token>   (must be a signed-in user)
//   → passes Anthropic's response THROUGH verbatim (status + body). Success body is
//     { content: [{ type:'text', text }], ... } which the client reads as content[0].text.
//
// NOTE: this replaces a mis-deployed function (the trip-invite emailer had been
// deployed under this slug, which made every AI call 403). Credit/quota gating is
// intentionally NOT re-added here (the original logic was lost) — add it back later
// if non-founder AI usage needs limiting; today it simply requires a signed-in user.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
const ANTHROPIC_VERSION = '2023-06-01'
const DEFAULT_MODEL = 'claude-sonnet-4-6'
const DEFAULT_MAX_TOKENS = 1024

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405, headers: cors })

  // Require a signed-in user — the AI key is server-side and must never be open to anon.
  const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const token = (req.headers.get('Authorization') || '').replace('Bearer ', '')
  const { data: u } = await supa.auth.getUser(token)
  if (!u?.user) return new Response('unauthorized', { status: 401, headers: cors })

  if (!ANTHROPIC_API_KEY) {
    console.error('[ai-proxy] ANTHROPIC_API_KEY is not set')
    return json({ error: 'AI is not configured (missing ANTHROPIC_API_KEY)' }, 500)
  }

  let payload: { messages?: unknown; model?: string; max_tokens?: number }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'invalid JSON body' }, 400)
  }
  const messages = payload.messages
  if (!Array.isArray(messages) || messages.length === 0) {
    return json({ error: 'messages[] is required' }, 400)
  }

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: payload.model ?? DEFAULT_MODEL,
      max_tokens: payload.max_tokens ?? DEFAULT_MAX_TOKENS,
      messages,
    }),
  })

  // Pass Anthropic's response through verbatim so the client's 429 handling works
  // and any real error (bad key 401, bad model 404, rate 429) surfaces with detail.
  const body = await r.text()
  if (!r.ok) console.error(`[ai-proxy] anthropic ${r.status}: ${body.slice(0, 400)}`)
  return new Response(body, { status: r.status, headers: { ...cors, 'Content-Type': 'application/json' } })
})
