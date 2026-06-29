// supabase/functions/delete-account/index.ts
//
// In-app account deletion (Apple Guideline 5.1.1(v)). Service-role orchestrator:
//   1. authenticate the caller from their JWT (NEVER trust uid/email from the body)
//   2. call the transactional delete_account_data RPC (all DB work, atomic)
//   3. run the Apple-token revoke hook (NO-OP while Sign in with Apple is disabled)
//   4. auth.admin.deleteUser LAST (cannot be in the Postgres tx)
// Honest failures: if (4) fails after (2) committed, return auth_delete_failed
// (retryable; the RPC is idempotent) — never claim "no data deleted".
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

// Sign in with Apple is OFF (see app APPLE_SIGNIN_ENABLED). When SIWA ships this
// MUST revoke the user's Apple token here before deletion. No-op until then.
const APPLE_SIGNIN_ENABLED = false
async function revokeAppleToken(_uid: string): Promise<void> {
  if (!APPLE_SIGNIN_ENABLED) return
  throw new Error('Apple token revocation not implemented — required before SIWA ships')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405, headers: cors })

  const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // 1. Resolve the caller from the token ONLY.
  const token = (req.headers.get('Authorization') || '').replace('Bearer ', '')
  const { data: u } = await supa.auth.getUser(token)
  if (!u?.user) return json({ error: 'unauthorized' }, 401)
  const uid = u.user.id
  const email = u.user.email ?? ''

  // 2. Atomic DB cleanup.
  const { data: summary, error: dbErr } = await supa.rpc('delete_account_data', { p_uid: uid, p_email: email })
  if (dbErr) {
    console.error('[delete-account] db error', dbErr)
    return json({ error: 'db_failed', message: dbErr.message }, 500)
  }

  // 3. Apple revoke hook (no-op while SIWA disabled).
  try {
    await revokeAppleToken(uid)
  } catch (e) {
    console.error('[delete-account] apple revoke failed', e)
    return json({ error: 'apple_revoke_failed', summary }, 500)
  }

  // 4. Delete the auth user LAST. If this fails, DB data is already gone — say so.
  const { error: authErr } = await supa.auth.admin.deleteUser(uid)
  if (authErr) {
    console.error('[delete-account] auth delete failed', authErr)
    return json({ error: 'auth_delete_failed', summary }, 500)
  }

  return json({ ok: true, summary }, 200)
})
