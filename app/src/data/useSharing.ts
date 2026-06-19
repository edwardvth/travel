import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../lib/supabase'

export async function createInviteLink(id: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_invite', { p_id: id })
  if (error || !data || data.ok !== true || !data.token) throw new Error('invite_failed')
  return `${location.origin}/Trip.html?trip=${id}&join=${data.token}`
}

export async function inviteByEmail(id: string, email: string): Promise<void> {
  const { data, error } = await supabase.rpc('add_trip_member', { p_id: id, p_email: email })
  if (error || !data || data.ok !== true) throw new Error(data?.reason || 'share_failed')
  try {
    const { data: sess } = await supabase.auth.getSession()
    const tok = sess.session?.access_token
    await fetch(`${SUPABASE_URL}/functions/v1/send-invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}`, apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ email, trip_id: id, link: `${location.origin}/Trip.html?trip=${id}` }),
    })
  } catch { /* email is best-effort */ }
}

export async function listMembers(id: string): Promise<string[]> {
  const { data } = await supabase.from('trip_members').select('email').eq('trip_id', id)
  return (data ?? []).map((m: { email: string }) => m.email)
}

export async function removeMember(id: string, email: string): Promise<void> {
  const { data } = await supabase.rpc('remove_trip_member', { p_id: id, p_email: email })
  if (!data || data.ok !== true) throw new Error('remove_failed')
}
