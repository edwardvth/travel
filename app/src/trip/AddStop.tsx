import { useEffect, useState } from 'react'
import { suggestPlaces } from './suggest'
import { Check, kindIcon, kindLabel, stopTypeIcon } from './icons'
import { cn } from '../lib/utils'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Sheet } from '../components/ui/Sheet'
import { Skeleton } from '../components/ui/Skeleton'
import type { Stop, StopKind, Trip, TripData } from '../types'

const KINDS: StopKind[] = ['do', 'eat', 'stay']

/** Per-kind placeholder copy for the search box. */
const KIND_PLACEHOLDER: Record<StopKind, string> = {
  do: 'e.g. hidden viewpoints, a classic museum, a riverside walk…',
  eat: 'e.g. great coffee, a classic trattoria, late-night ramen…',
  stay: 'e.g. a boutique hotel, a quiet ryokan, central lodging…',
}

interface AddStopProps {
  open: boolean
  onClose: () => void
  trip: Trip
  day: number
  /** Persist a partial trip update (already edit-gated by the caller). */
  save: (partial: { data: TripData }) => void
}

type Status = 'idle' | 'loading' | 'done' | 'error'

const TITLE_ID = 'add-stop-title'

export function AddStop({ open, onClose, trip, day, save }: AddStopProps) {
  const [kind, setKind] = useState<StopKind>('do')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [results, setResults] = useState<Stop[]>([])
  const [error, setError] = useState<string | null>(null)
  const [addedCount, setAddedCount] = useState(0)
  const [lastAdded, setLastAdded] = useState<string | null>(null)

  // Reset state whenever the sheet opens.
  useEffect(() => {
    if (!open) return
    setKind('do')
    setQuery('')
    setStatus('idle')
    setResults([])
    setError(null)
    setAddedCount(0)
    setLastAdded(null)
  }, [open])

  async function runSearch() {
    const q = query.trim()
    if (!q || status === 'loading') return
    setStatus('loading')
    setError(null)
    setResults([])
    try {
      const places = await suggestPlaces(q, { tripTitle: trip.title, kind })
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

  /** Append a stop to the active day immutably and persist, tagged with the
   *  currently-selected category. */
  function addStop(stop: Stop) {
    const tagged: Stop = { ...stop, kind }
    const data = trip.data
    const next: TripData = {
      ...data,
      days: data.days.map((d, i) =>
        i === day ? { ...d, stops: [...d.stops, tagged] } : d,
      ),
    }
    save({ data: next })
    setAddedCount(c => c + 1)
    setLastAdded(stop.name)
  }

  function addTyped() {
    const q = query.trim()
    if (!q) return
    addStop({ name: q })
  }

  return (
    <Sheet open={open} onClose={onClose} labelledBy={TITLE_ID}>
      <div className="flex items-start justify-between gap-3 mb-1">
        <h2 id={TITLE_ID} className="font-serif text-2xl">
          Add a stop
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex-none -mr-1 -mt-1 rounded-md p-1.5 text-muted hover:text-ink hover:bg-fill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <p className="text-muted text-[13px] mb-4">
        Search for a place and I’ll find a few real spots — or just add one by name.
      </p>

      {/* Category toggle — biases the AI suggest and tags every added stop. */}
      <div
        role="group"
        aria-label="Stop category"
        className="flex p-1 mb-4 rounded-btn bg-fill border border-hair"
      >
        {KINDS.map(k => {
          const KindIcon = kindIcon(k)
          const active = kind === k
          return (
            <button
              key={k}
              type="button"
              aria-pressed={active}
              onClick={() => setKind(k)}
              className={cn(
                'flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-[10px] text-[13px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link',
                active ? 'bg-sig-btn text-white' : 'text-muted hover:text-ink',
              )}
            >
              <KindIcon size={15} aria-hidden="true" />
              {kindLabel(k)}
            </button>
          )
        })}
      </div>

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
          placeholder={KIND_PLACEHOLDER[kind]}
          aria-label="Search for a place"
        />
        <Button type="submit" variant="claret" busy={status === 'loading'} className="flex-none">
          Search
        </Button>
      </form>

      {/* Added confirmation (kept open so several can be added). */}
      {addedCount > 0 && (
        <p
          role="status"
          className="mt-3 text-[13px] text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-card px-3.5 py-2"
        >
          <Check size={14} strokeWidth={3} aria-hidden="true" className="inline-block align-[-2px] mr-1" />
          Added{lastAdded ? ` “${lastAdded}”` : ''}
          {addedCount > 1 ? ` (${addedCount} so far)` : ''}
        </p>
      )}

      {/* Error state. */}
      {status === 'error' && error && (
        <div className="mt-4 text-[13px] text-sig bg-sig/5 border border-sig/20 rounded-card px-4 py-3">
          <p>{error}</p>
          <button
            type="button"
            onClick={addTyped}
            className="mt-2 font-bold text-sig-link hover:underline"
          >
            Add “{query.trim()}” by name instead
          </button>
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

      {/* Results. */}
      {status === 'done' && results.length > 0 && (
        <ul className="mt-4 space-y-2.5">
          {results.map((r, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => addStop(r)}
                className="w-full text-left flex gap-3 items-start rounded-card border border-hair bg-fill hover:bg-fill-hover px-3.5 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link"
              >
                {(() => {
                  const TypeIcon = stopTypeIcon(r.type)
                  return (
                    <span aria-hidden="true" className="flex-none grid place-items-center w-7 h-7 rounded-md bg-base text-muted mt-0.5">
                      <TypeIcon size={16} />
                    </span>
                  )
                })()}
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
                <span aria-hidden="true" className="flex-none self-center text-sig-link font-bold text-[13px]">
                  + Add
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Empty results. */}
      {status === 'done' && results.length === 0 && (
        <div className="mt-4 text-center">
          <p className="text-muted text-[13.5px]">
            Hmm, nothing came back for that. Try different words —
          </p>
          <button
            type="button"
            onClick={addTyped}
            className="mt-2 font-bold text-[13.5px] text-sig-link hover:underline"
          >
            or add “{query.trim()}” by name
          </button>
        </div>
      )}

      {/* Footer. */}
      <div className="mt-5 flex items-center justify-end gap-2.5 pt-4 border-t border-hair">
        {query.trim() && status !== 'loading' && (
          <Button variant="ghost" onClick={addTyped}>
            Add by name
          </Button>
        )}
        <Button variant="soft" onClick={onClose}>
          Done
        </Button>
      </div>
    </Sheet>
  )
}
