import { useEffect, useState } from 'react'
import { BedDouble } from './icons'
import { normalizeHotel } from './hotel'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import type { Hotel, Trip, TripData } from '../types'

/**
 * The Voyage base **Stay**, pinned atop each day's Plan (below the weather
 * glance, above the stops). Reads `data.hotel` via `normalizeHotel` so it's
 * robust to the loosely-stored legacy shape (string | object | null). The same
 * Stay shows on every day — it's the Voyage base lodging, by design.
 *
 * When `canEdit`, an inline editor writes `data.hotel` immutably via `save`.
 * When no Stay is set, a subtle "Add your stay" prompt appears (edit only);
 * viewers see nothing rather than an empty shell.
 */
export function StayCard({ trip, canEdit, save }: {
  trip: Trip
  canEdit: boolean
  save: (partial: { data: TripData }) => void
}) {
  const hotel = normalizeHotel(trip.data?.hotel)
  const [editing, setEditing] = useState(false)

  // No Stay + can't edit → render nothing (avoid an empty card for viewers).
  if (!hotel && !canEdit) return null

  if (editing) {
    return (
      <StayEditor
        trip={trip}
        hotel={hotel}
        save={save}
        onDone={() => setEditing(false)}
      />
    )
  }

  if (!hotel) {
    // Subtle "add your stay" prompt — edit only.
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="mb-4 w-full flex items-center gap-2.5 rounded-card border border-dashed border-hair bg-fill/40 px-3.5 py-2.5 text-left text-muted hover:text-ink hover:bg-fill transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link"
      >
        <span className="flex-none grid place-items-center w-8 h-8 rounded-md bg-base">
          <BedDouble size={16} aria-hidden="true" />
        </span>
        <span className="text-[13.5px] font-bold">Add your stay</span>
      </button>
    )
  }

  return (
    <div className="mb-4 flex items-start gap-3 rounded-card border border-sig/20 bg-sig/[0.04] px-3.5 py-3">
      <span className="flex-none grid place-items-center w-8 h-8 rounded-md bg-sig/10 text-sig" aria-hidden="true">
        <BedDouble size={17} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold uppercase tracking-wide text-sig/80">Your stay</p>
        <p className="font-bold text-[15px] text-ink truncate">{hotel.name || 'Your stay'}</p>
        {hotel.address && <p className="text-muted text-[12.5px] truncate">{hotel.address}</p>}
        {hotel.note && <p className="text-ink/75 text-[12.5px] mt-0.5 leading-snug">{hotel.note}</p>}
      </div>
      {canEdit && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Edit your stay"
          className="flex-none -mr-1 -mt-0.5 grid place-items-center w-9 h-9 rounded-md text-muted hover:text-ink hover:bg-fill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </button>
      )}
    </div>
  )
}

/** Inline name/address/note editor for the Voyage Stay. */
function StayEditor({ trip, hotel, save, onDone }: {
  trip: Trip
  hotel: Hotel | null
  save: (partial: { data: TripData }) => void
  onDone: () => void
}) {
  const [name, setName] = useState(hotel?.name ?? '')
  const [address, setAddress] = useState(hotel?.address ?? '')
  const [note, setNote] = useState(hotel?.note ?? '')

  // Re-seed if the underlying hotel changes while the editor is open.
  useEffect(() => {
    setName(hotel?.name ?? '')
    setAddress(hotel?.address ?? '')
    setNote(hotel?.note ?? '')
  }, [hotel])

  function onSave() {
    const next: Hotel = {}
    const n = name.trim()
    const a = address.trim()
    const t = note.trim()
    if (n) next.name = n
    if (a) next.address = a
    if (t) next.note = t
    // Preserve any existing coords (set elsewhere) so editing text doesn't drop the pin.
    if (hotel?.lat !== undefined) next.lat = hotel.lat
    if (hotel?.lng !== undefined) next.lng = hotel.lng

    const hasContent = n || a || t
    const data: TripData = { ...trip.data, hotel: hasContent ? next : null }
    save({ data })
    onDone()
  }

  const nameId = 'stay-name'
  const addrId = 'stay-address'
  const noteId = 'stay-note'

  return (
    <div className="mb-4 rounded-card border border-sig/20 bg-sig/[0.04] px-3.5 py-3.5 space-y-3">
      <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-sig/80">
        <BedDouble size={13} aria-hidden="true" /> Your stay
      </p>
      <div className="space-y-2.5">
        <label className="block" htmlFor={nameId}>
          <span className="block text-[12px] font-bold text-muted mb-1">Name</span>
          <Input id={nameId} value={name} onChange={e => setName(e.target.value)} placeholder="Hotel Edison NYC" autoFocus />
        </label>
        <label className="block" htmlFor={addrId}>
          <span className="block text-[12px] font-bold text-muted mb-1">Address</span>
          <Input id={addrId} value={address} onChange={e => setAddress(e.target.value)} placeholder="228 W 47th St, New York" />
        </label>
        <label className="block" htmlFor={noteId}>
          <span className="block text-[12px] font-bold text-muted mb-1">Note (optional)</span>
          <Input id={noteId} value={note} onChange={e => setNote(e.target.value)} placeholder="Check-in 3pm · confirmation #…" />
        </label>
      </div>
      <div className="flex items-center justify-end gap-2.5 pt-1">
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button variant="claret" onClick={onSave}>Save stay</Button>
      </div>
    </div>
  )
}
