import { useEffect, useState } from 'react'
import { Sheet } from '../components/ui/Sheet'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { sanitizeSlug, isValidSlug, hasProfanity } from '../lib/trip-helpers'
import { useCreateTrip } from '../data/useTrips'

const REASONS: Record<string, string> = {
  slug_taken: 'That Trip ID already exists — pick another.',
  no_credits: "You're out of trip credits. Credit packs are coming soon.",
  invalid_name: 'Please choose a different name.',
  no_profile: 'No account profile found — sign out and back in.',
}

export function NewTripSheet({ open, onClose, onCreated, isTeaser }:
  { open: boolean; onClose: () => void; onCreated: (id: string) => void; isTeaser?: boolean }) {
  const [step, setStep] = useState<1 | 2>(1)
  const [slug, setSlug] = useState(''); const [title, setTitle] = useState(''); const [subtitle, setSubtitle] = useState('')
  const [start, setStart] = useState(''); const [end, setEnd] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const create = useCreateTrip()

  // Fresh form each time the sheet opens (it stays mounted between opens).
  useEffect(() => {
    if (open) { setStep(1); setSlug(''); setTitle(''); setSubtitle(''); setStart(''); setEnd(''); setErr(null) }
  }, [open])

  const next = () => {
    if (!slug || !title) return setErr('Trip ID and title are required.')
    if (!isValidSlug(slug)) return setErr('Trip ID can only contain letters, numbers, and dashes.')
    if (hasProfanity(slug, title, subtitle)) return setErr('Please choose a different name.')
    setErr(null); setStep(2)
  }
  const submit = async () => {
    setErr(null)
    try { onCreated(await create.mutateAsync({ slug, title, subtitle, start, end })) }
    catch (e) { setErr(REASONS[(e as Error).message] ?? "Couldn't create this trip. Try again.") }
  }

  return (
    <Sheet open={open} onClose={onClose} labelledBy="newtrip-title">
      <h2 id="newtrip-title" className="font-serif text-2xl">{step === 1 ? 'Where to?' : 'When are you going?'}</h2>
      <p className="text-muted text-[13px] mt-1">{step === 1 ? "Name your trip — you'll add days next." : 'Pick your dates, or skip and set them later.'}</p>

      {step === 1 ? (
        <div className="mt-5 space-y-2.5">
          <Input aria-label="Trip ID" placeholder="Trip ID (e.g. kyoto2026)" value={slug} onChange={e => setSlug(sanitizeSlug(e.target.value))} />
          <Input aria-label="Trip title" placeholder="Title (e.g. Kyoto Spring 2026)" value={title} onChange={e => setTitle(e.target.value)} />
          <Input aria-label="Subtitle (optional)" placeholder="Subtitle (optional)" value={subtitle} onChange={e => setSubtitle(e.target.value)} />
          {isTeaser && <p className="text-[12.5px] text-sig-link">Your first trip is a free teaser — plan all your days and fill Day 1.</p>}
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          <label className="block text-[12px] font-bold uppercase tracking-wide text-muted">Start date
            <Input type="date" value={start} onChange={e => setStart(e.target.value)} className="mt-1" />
          </label>
          <label className="block text-[12px] font-bold uppercase tracking-wide text-muted">End date
            <Input type="date" value={end} onChange={e => setEnd(e.target.value)} className="mt-1" />
          </label>
          {start && end && <p className="font-mono text-[12px] text-muted">{`${start} → ${end}`}</p>}
        </div>
      )}

      {err && <p className="mt-3 text-[13px] text-sig-link">{err}</p>}

      <div className="mt-6 flex gap-2.5">
        {step === 1
          ? <><Button variant="soft" className="flex-1" onClick={onClose}>Cancel</Button>
              <Button variant="claret" className="flex-1" onClick={next}>Next</Button></>
          : <><Button variant="soft" className="flex-1" onClick={() => setStep(1)}>Back</Button>
              <Button variant="claret" className="flex-1" busy={create.isPending} onClick={submit}>Create trip</Button></>}
      </div>
    </Sheet>
  )
}
