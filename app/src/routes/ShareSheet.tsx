import { useEffect, useState } from 'react'
import { Sheet } from '../components/ui/Sheet'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { createInviteLink, inviteByEmail, listMembers, removeMember } from '../data/useSharing'

export function ShareSheet({ tripId, open, onClose }: { tripId: string; open: boolean; onClose: () => void }) {
  const [email, setEmail] = useState(''); const [msg, setMsg] = useState<string | null>(null)
  const [members, setMembers] = useState<string[]>([])
  useEffect(() => { if (open) listMembers(tripId).then(setMembers).catch(() => {}) }, [open, tripId])

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(await createInviteLink(tripId)); setMsg('Link copied — anyone who opens it joins the trip.') }
    catch { setMsg("Couldn't create a link. Try again.") }
  }
  const send = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setMsg('Enter a valid email address.')
    try { await inviteByEmail(tripId, email); setEmail(''); setMsg('Invited.'); setMembers(await listMembers(tripId)) }
    catch { setMsg("Couldn't share this trip. Only the owner can.") }
  }
  const remove = async (e: string) => { try { await removeMember(tripId, e); setMembers(await listMembers(tripId)) } catch { /* ignore */ } }

  return (
    <Sheet open={open} onClose={onClose} labelledBy="share-title">
      <h2 id="share-title" className="font-serif text-2xl">Share “{tripId}”</h2>
      <Button variant="soft" className="w-full mt-4" onClick={copyLink}>Copy invite link</Button>
      <div className="my-4 flex items-center gap-3 text-muted text-[12px]"><div className="flex-1 h-px bg-hair" />or invite by email<div className="flex-1 h-px bg-hair" /></div>
      <div className="flex gap-2">
        <Input placeholder="Email address" type="email" value={email} onChange={e => setEmail(e.target.value)} />
        <Button variant="claret" onClick={send}>Send</Button>
      </div>
      {msg && <p className="mt-2 text-[12.5px] text-sig-link">{msg}</p>}
      {members.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {members.map(m => (
            <li key={m} className="flex items-center justify-between text-[13px] border-b border-hair pb-1.5">
              <span>{m}</span>
              <button className="text-sig-link text-[12px]" onClick={() => remove(m)}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      <Button variant="soft" className="w-full mt-5" onClick={onClose}>Done</Button>
    </Sheet>
  )
}
