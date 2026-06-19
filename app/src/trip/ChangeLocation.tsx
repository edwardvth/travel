import { useEffect, useState } from 'react'
import { suggestPlaces } from './suggest'
import { placeFromSuggestion, type PlaceLocation } from './location'
import { Check, MapPin, Search, stopTypeIcon } from './icons'
import { cn } from '../lib/utils'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Sheet } from '../components/ui/Sheet'
import { Skeleton } from '../components/ui/Skeleton'
import type { Stop } from '../types'

interface ChangeLocationProps {
  open: boolean
  onClose: () => void
  /** The stop being re-located (for its current name/address in the panel). */
  stop: Pick<Stop, 'name' | 'address'>
  /** Trip title — anchors the AI suggest to the right destination. */
  tripTitle: string
  /** Apply the chosen new location to the stop (already edit-gated by caller). */
  onConfirm: (place: PlaceLocation) => void
}

type Status = 'idle' | 'loading' | 'done' | 'error'

const TITLE_ID = 'change-location-title'

/**
 * Re-pick a stop's location. Reuses the same `suggestPlaces` machinery as Add
 * and resolves the chosen result through the shared `placeFromSuggestion`, then
 * previews it (name + address) before the user confirms. Replaces the legacy
 * "Not the right place?" flow. Cancel / Esc / backdrop leave the stop unchanged.
 */
export function ChangeLocation({ open, onClose, stop, tripTitle, onConfirm }: ChangeLocationProps) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [results, setResults] = useState<Stop[]>([])
  const [selected, setSelected] = useState<PlaceLocation | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Reset whenever the panel opens.
  useEffect(() => {
    if (!open) return
    setQuery('')
    setStatus('idle')
    setResults([])
    setSelected(null)
    setError(null)
  }, [open])

  async function runSearch() {
    const q = query.trim()
    if (!q || status === 'loading') return
    setStatus('loading')
    setError(null)
    setResults([])
    setSelected(null)
    try {
      const places = await suggestPlaces(q, { tripTitle })
      setResults(places)
      setStatus('done')
    } catch (e) {
      setError(
        e instanceof Error
          ? `I couldn’t fetch suggestions just now — ${e.message}`
          : 'I couldn’t fetch suggestions just now. Give it another go in a moment.',
      )
      setStatus('error')
    }
  }

  /** Preview a chosen AI result. */
  function pick(result: Stop) {
    setSelected(placeFromSuggestion(result))
  }

  /** Preview the typed name verbatim (no coordinates). */
  function pickTyped() {
    const q = query.trim()
    if (!q) return
    setSelected(placeFromSuggestion({ name: q }))
  }

  function confirm() {
    if (!selected) return
    onConfirm(selected)
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} labelledBy={TITLE_ID}>
      <div className="flex items-start justify-between gap-3 mb-1">
        <h2 id={TITLE_ID} className="font-serif text-2xl">
          Change location
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex-none -mr-1 -mt-1 grid place-items-center w-11 h-11 rounded-md text-muted hover:text-ink hover:bg-fill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <p className="text-muted text-[13px] mb-4">
        Search for the right place — or type its name — and we’ll update this stop.
        Your photos, notes and reservations stay put.
      </p>

      <form
        onSubmit={e => {
          e.preventDefault()
          runSearch()
        }}
        className="flex gap-2"
      >
        <Input
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={`e.g. ${stop.name || 'the correct place'}`}
          aria-label="Search for the correct place"
        />
        <Button type="submit" variant="claret" busy={status === 'loading'} className="flex-none">
          <Search size={16} aria-hidden="true" />
          Search
        </Button>
      </form>

      {/* Error state — offer the typed name as a fallback. */}
      {status === 'error' && error && (
        <div className="mt-4 text-[13px] text-sig bg-sig/5 border border-sig/20 rounded-card px-4 py-3">
          <p>{error}</p>
          {query.trim() && (
            <button
              type="button"
              onClick={pickTyped}
              className="mt-2 font-bold text-sig-link hover:underline"
            >
              Use “{query.trim()}” as the name instead
            </button>
          )}
        </div>
      )}

      {/* Loading skeletons. */}
      {status === 'loading' && (
        <div className="mt-4 space-y-2.5" aria-hidden="true">
          {[0, 1, 2].map(i => (
            <Skeleton key={i} className="h-[68px] w-full rounded-card" />
          ))}
        </div>
      )}

      {/* Results — selecting one moves it into the preview below. */}
      {status === 'done' && results.length > 0 && (
        <ul className="mt-4 space-y-2.5">
          {results.map((r, i) => {
            const TypeIcon = stopTypeIcon(r.type)
            const active = selected?.name === r.name && selected?.address === (r.address ?? undefined)
            return (
              <li key={i}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => pick(r)}
                  className={cn(
                    'w-full text-left flex gap-3 items-start rounded-card border px-3.5 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link',
                    active
                      ? 'border-sig-link bg-sig-link/5'
                      : 'border-hair bg-fill hover:bg-fill-hover',
                  )}
                >
                  <span aria-hidden="true" className="flex-none grid place-items-center w-7 h-7 rounded-md bg-base text-muted mt-0.5">
                    <TypeIcon size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-[15px] text-ink truncate">{r.name}</span>
                    {(r.type || r.address) && (
                      <span className="block text-muted text-[12.5px] truncate">
                        {[r.type, r.address].filter(Boolean).join(' · ')}
                      </span>
                    )}
                    {r.note && (
                      <span className="block text-ink/75 text-[12.5px] mt-1 leading-snug">{r.note}</span>
                    )}
                  </span>
                  {active && (
                    <span aria-hidden="true" className="flex-none self-center text-sig-link">
                      <Check size={18} strokeWidth={3} />
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {/* Empty results — offer the typed name. */}
      {status === 'done' && results.length === 0 && (
        <div className="mt-4 text-center">
          <p className="text-muted text-[13.5px]">Hmm, nothing came back for that. Try different words —</p>
          {query.trim() && (
            <button
              type="button"
              onClick={pickTyped}
              className="mt-2 font-bold text-[13.5px] text-sig-link hover:underline"
            >
              or use “{query.trim()}” as the name
            </button>
          )}
        </div>
      )}

      {/* Preview of the chosen new location. */}
      {selected && (
        <div
          role="status"
          className="mt-4 rounded-card border border-hair bg-fill px-4 py-3.5"
        >
          <span className="block text-[11.5px] font-bold uppercase tracking-wide text-muted mb-1">
            New location
          </span>
          <span className="flex items-start gap-2">
            <MapPin size={16} aria-hidden="true" className="flex-none mt-0.5 text-sig-link" />
            <span className="min-w-0">
              <span className="block font-bold text-[15px] text-ink">{selected.name}</span>
              {selected.address && (
                <span className="block text-muted text-[13px]">{selected.address}</span>
              )}
              {selected.lat == null && (
                <span className="block text-muted text-[12px] mt-0.5">No map pin for this one yet.</span>
              )}
            </span>
          </span>
        </div>
      )}

      {/* Footer — Confirm is enabled only once a place is previewed. */}
      <div className="mt-5 flex items-center justify-end gap-2.5 pt-4 border-t border-hair">
        {query.trim() && status !== 'loading' && !selected && (
          <Button variant="ghost" onClick={pickTyped}>
            Use typed name
          </Button>
        )}
        <Button variant="soft" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="claret" disabled={!selected} onClick={confirm}>
          <Check size={16} aria-hidden="true" />
          Confirm
        </Button>
      </div>
    </Sheet>
  )
}
