// supabase/functions/send-invite/index.ts
//
// Sends the "you've been invited to a trip" email (Resend). Called by
// app/src/data/useSharing.ts → inviteByEmail after the add_trip_member RPC
// adds the member; the email itself is best-effort on the client.
//
// Contract: POST { email, trip_id, link }, Authorization: Bearer <session token>.
// Owner-gated: only the trip's owner may send invites for it.
//
// NOTE: this code had been mistakenly deployed under the `ai-proxy` slug (which
// broke AI), while the `send-invite` slug didn't exist (so invite emails never
// sent). Deploy this to the `send-invite` slug; deploy the Claude proxy to
// `ai-proxy`. Requires the RESEND_API_KEY secret.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const token = (req.headers.get('Authorization') || '').replace('Bearer ', '')
  const { data: u } = await supa.auth.getUser(token)
  if (!u?.user) return new Response('unauthorized', { status: 401, headers: cors })

  const { email, trip_id, link } = await req.json()
  const { data: t } = await supa.from('trips').select('title, owner_id').eq('id', trip_id).maybeSingle()
  if (!t || t.owner_id !== u.user.id) return new Response('forbidden', { status: 403, headers: cors })

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + Deno.env.get('RESEND_API_KEY')! },
    body: JSON.stringify({
      from: 'Travel Guide <noreply@travel-guide.ai>',
      to: [email],
      subject: `You're invited to "${t.title || trip_id}" on Travel Guide`,
      html: `<p>${u.user.email} invited you to plan <b>${t.title || trip_id}</b> together.</p><p><a href="${link}">Open the trip</a> and sign in (or create a free account) with this email address — the trip will appear in your list automatically.</p>`,
    }),
  })
  return new Response(JSON.stringify({ ok: r.ok }), { status: r.ok ? 200 : 500, headers: { ...cors, 'Content-Type': 'application/json' } })
})
