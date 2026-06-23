// supabase/functions/ai-proxy/index.ts
//
// Server-side proxy to the Claude (Anthropic) API — the AI key lives ONLY here
// (env secret ANTHROPIC_API_KEY), never in the client. Called by
// app/src/trip/ai.ts → callAI for AI place suggestions (Plan) and stop
// enrichment (Guide).
//
// Access model (mirrors the legacy travel-guide.ai Trip.html gate):
//   • role === 'founder'  → unlimited AI.
//   • credits > 0         → "family & friends": allowed; one credit deducted per call.
//   • otherwise           → 403 (no AI access).
// The gate is enforced HERE (server-side) so it can't be bypassed by the client.
//
// Contract: POST { messages, model?, max_tokens? } with Authorization: Bearer
// <supabase session access token>. Returns Anthropic's response through verbatim
// ({ content:[{text}], ... }), with `credits` appended on success so a client can
// reflect the new balance.
//
// NOTE: this slug had a mis-deployed function (the trip-invite emailer), which is
// why every AI call 403'd. Deploy this to `ai-proxy`; set ANTHROPIC_API_KEY.

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

  const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // 1. Require a signed-in user.
  const token = (req.headers.get('Authorization') || '').replace('Bearer ', '')
  const { data: u } = await supa.auth.getUser(token)
  if (!u?.user) return new Response('unauthorized', { status: 401, headers: cors })

  if (!ANTHROPIC_API_KEY) {
    console.error('[ai-proxy] ANTHROPIC_API_KEY is not set')
    return json({ error: 'AI is not configured (missing ANTHROPIC_API_KEY)' }, 500)
  }

  // 2. Access gate: founder (unlimited) OR credits > 0 (family & friends).
  const { data: profile } = await supa.from('profiles').select('role, credits').eq('id', u.user.id).maybeSingle()
  const isFounder = profile?.role === 'founder'
  const credits = typeof profile?.credits === 'number' ? profile.credits : 0
  if (!isFounder && credits < 1) {
    return json({ error: 'no_ai_access', credits, reason: 'AI is available to founders or accounts with credits.' }, 403)
  }

  // 3. Parse the request.
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

  // 4. Call Anthropic with the shared server-side key.
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

  const text = await r.text()
  if (!r.ok) {
    console.error(`[ai-proxy] anthropic ${r.status}: ${text.slice(0, 400)}`)
    // Pass the real status through so the client's 429 handling + error detail work.
    return new Response(text, { status: r.status, headers: { ...cors, 'Content-Type': 'application/json' } })
  }

  // 5. Deduct a credit for non-founders (only on success), and return the body
  //    with the new balance appended (legacy clients read `credits`).
  let remaining = credits
  if (!isFounder) {
    remaining = credits - 1
    await supa.from('profiles').update({ credits: remaining }).eq('id', u.user.id)
  }
  let out: Record<string, unknown>
  try {
    out = JSON.parse(text)
  } catch {
    return new Response(text, { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
  out.credits = isFounder ? null : remaining
  return json(out, 200)
})
