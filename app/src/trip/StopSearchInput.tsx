import { useEffect, useId, useRef, useState } from 'react'
import { Search, Loader2, stopTypeIcon } from './icons'
import { useStopSearch } from '../data/useStopSearch'
import type { Prediction, SearchRegion } from '../lib/placeSearch'
import { cn } from '../lib/utils'

const DEBOUNCE_MS = 300
const MIN_QUERY = 3
const newToken = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.round(Math.random() * 1e9)}`)

/**
 * As-you-type place search for AddStop. Country-scoped + proximity-biased via
 * `region`; debounced (~300ms); one Google session token per typing session
 * (reset after a select). Selecting a prediction calls `onSelect(prediction,
 * sessionToken)` — the parent resolves details under the same token. Keyboard +
 * a11y parity with DestinationInput.
 */
export function StopSearchInput({ region, onSelect, placeholder = 'Search for a place…' }:
  { region: SearchRegion; onSelect: (p: Prediction, sessionToken: string) => void; placeholder?: string }) {
  const [value, setValue] = useState('')
  const [debounced, setDebounced] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const tokenRef = useRef(newToken())
  const listId = useId()
  const optionId = (i: number) => `${listId}-opt-${i}`

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [value])

  const { predictions, loading } = useStopSearch(debounced, region, tokenRef.current)
  const showList = open && value.trim().length >= MIN_QUERY && (loading || predictions.length > 0)
  useEffect(() => { setActive(-1) }, [predictions])

  const select = (p: Prediction) => {
    onSelect(p, tokenRef.current)
    tokenRef.current = newToken() // new billing session for the next search
    setValue('')
    setDebounced('')
    setOpen(false)
    setActive(-1)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { if (showList) { e.stopPropagation(); e.preventDefault(); setOpen(false); setActive(-1) } return }
    if (!showList || predictions.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => (i + 1) % predictions.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => (i <= 0 ? predictions.length - 1 : i - 1)) }
    else if (e.key === 'Enter' && active >= 0 && active < predictions.length) { e.preventDefault(); select(predictions[active]) }
  }

  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"><Search size={16} aria-hidden="true" /></span>
      <input
        type="text" role="combobox" aria-expanded={showList} aria-controls={listId} aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? optionId(active) : undefined} aria-label={placeholder} autoComplete="off"
        value={value} placeholder={placeholder}
        onChange={e => { setValue(e.target.value); setOpen(true) }}
        onFocus={() => { if (value.trim().length >= MIN_QUERY) setOpen(true) }}
        onBlur={() => setOpen(false)} onKeyDown={onKeyDown}
        className={cn('w-full rounded-btn bg-fill border border-hair pl-10 pr-10 py-3 text-[15px] text-ink',
          'placeholder:text-muted outline-none focus:border-sig-link transition-colors')}
      />
      {loading && <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted"><Loader2 size={16} className="animate-spin" aria-hidden="true" /></span>}

      {showList && (
        <ul id={listId} role="listbox" aria-label="Place suggestions"
          className={cn('absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-btn border border-hair bg-base shadow-lift')}>
          {predictions.length === 0 && loading && (
            <li className="flex min-h-[44px] items-center gap-2 px-3.5 text-[13px] text-muted" aria-hidden="true"><Search size={15} /> Searching…</li>
          )}
          {predictions.map((p, i) => {
            const TypeIcon = stopTypeIcon(p.types[0])
            return (
              <li key={p.placeId} id={optionId(i)} role="option" aria-selected={i === active}
                onMouseDown={e => { e.preventDefault(); select(p) }} onMouseEnter={() => setActive(i)}
                className={cn('flex min-h-[44px] cursor-pointer items-start gap-2.5 px-3.5 py-2 text-[14px] text-ink transition-colors', i === active ? 'bg-fill' : 'hover:bg-fill')}>
                <TypeIcon size={15} className="shrink-0 mt-0.5 text-muted" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{p.primaryText}</span>
                  {p.secondaryText && <span className="block truncate text-[12.5px] text-muted">{p.secondaryText}</span>}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
