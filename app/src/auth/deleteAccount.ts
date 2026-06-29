// app/src/auth/deleteAccount.ts
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../lib/supabase'

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; code: 'unauthorized' | 'auth_delete_failed' | 'error'; message: string }

/**
 * Call the `delete-account` Edge Function with the current session token. The
 * function resolves the user from the token, so no uid/email is sent. Maps the
 * response to a typed result; the UI handles teardown/retry messaging.
 */
export async function requestAccountDeletion(): Promise<DeleteAccountResult> {
  let token = SUPABASE_ANON_KEY
  try {
    const { data } = await supabase.auth.getSession()
    if (data?.session?.access_token) token = data.session.access_token
  } catch { /* fall through */ }

  const url = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/delete-account`
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: '{}',
    })
  } catch {
    return { ok: false, code: 'error', message: 'Network error — please try again.' }
  }

  if (res.ok) return { ok: true }
  if (res.status === 401) return { ok: false, code: 'unauthorized', message: 'Please sign in again, then retry.' }

  let body: { error?: string } = {}
  try { body = await res.json() } catch { /* ignore */ }
  if (body.error === 'auth_delete_failed') {
    return { ok: false, code: 'auth_delete_failed',
      message: 'Your data was removed, but finishing account deletion failed. Please try again.' }
  }
  return { ok: false, code: 'error', message: 'Could not delete your account. Please try again.' }
}
