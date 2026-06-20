import { useEffect, useId, useRef, useState } from 'react'
import { MapPin, Search, Loader2 } from '../trip/icons'
import { usePlaceSearch } from '../data/usePlaceSearch'
import { cn } from '../lib/utils'

/** Debounce before querying Photon (ms) — keeps typing snappy + within fair-use. */
const DEBOUNCE_MS = 280
/** Min chars before suggestions appear (mirrors the hook's gate). */
const MIN_QUERY = 3

/**
 * Labelled destination input with a Photon-backed autocomplete dropdown that
 * overlays *below* the field (absolute-positioned — never shifts layout).
 *
 * Typing is debounced (~280ms) before hitting Photon; the query is cached by
 * `usePlaceSearch` (TanStack), which cancels superseded in-flight fetches via
 * its AbortSignal. Suggestions appear at ≥3 chars. Selecting one fills the
 * field with the clean label; free-typed text is accepted as-is.
 *
 * a11y/mobile: ≥44px rows, `autoComplete="off"`, full keyboard nav
 * (↑/↓/Enter/Esc), `role="listbox"`/`option` with `aria-*`, focus-visible
 * rings, a subtle loading state, and dismiss on blur/Esc. Anti-slop: lucide
 * icons, token classes, light + dark.
 */
export function DestinationInput({ value, onChange, label = 'Destination', placeholder = 'Destination (e.g. Kyoto, Japan)' }:
  { value: string; onChange: (v: string) => void; label?: string; placeholder?: string }) {
  const [debounced, setDebounced] = useState(value)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  // True only when the latest change came from typing — suppresses re-opening
  // the dropdown after a programmatic select.
  const typing = useRef(false)

  const listId = useId()
  const optionId = (i: number) => `${listId}-opt-${i}`

  // Debounce the value the hook queries with.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [value])

  const { places, loading } = usePlaceSearch(debounced)
  const showList = open && value.trim().length >= MIN_QUERY && (loading || places.length > 0)

  // Keep the active index in range as the list changes.
  useEffect(() => { setActive(-1) }, [places])

  const select = (label: string) => {
    typing.current = false
    onChange(label)
    setOpen(false)
    setActive(-1)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      if (showList) {
        // Swallow Esc so the surrounding Sheet doesn't also close.
        e.stopPropagation()
        e.preventDefault()
        setOpen(false)
        setActive(-1)
      }
      return
    }
    if (!showList || places.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(i => (i + 1) % places.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(i => (i <= 0 ? places.length - 1 : i - 1))
    } else if (e.key === 'Enter') {
      if (active >= 0 && active < places.length) {
        e.preventDefault()
        select(places[active])
      }
    }
  }

  return (
    <div className="relative">
      <label className="block">
        <span className="sr-only">{label}</span>
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">
          <MapPin size={16} aria-hidden="true" />
        </span>
        <input
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? optionId(active) : undefined}
          aria-label={label}
          autoComplete="off"
          value={value}
          placeholder={placeholder}
          onChange={e => { typing.current = true; onChange(e.target.value); setOpen(true) }}
          onFocus={() => { if (typing.current || value.trim().length >= MIN_QUERY) setOpen(true) }}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className={cn(
            'w-full rounded-btn bg-fill border border-hair pl-10 pr-10 py-3 text-[15px] text-ink',
            'placeholder:text-muted outline-none focus:border-sig-link transition-colors',
          )}
        />
        {loading && (
          <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted">
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          </span>
        )}
      </label>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label={`${label} suggestions`}
          className={cn(
            'absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-btn',
            'border border-hair bg-base shadow-lift',
          )}
        >
          {places.length === 0 && loading && (
            <li className="flex min-h-[44px] items-center gap-2 px-3.5 text-[13px] text-muted" aria-hidden="true">
              <Search size={15} /> Searching…
            </li>
          )}
          {places.map((place, i) => (
            <li
              key={place}
              id={optionId(i)}
              role="option"
              aria-selected={i === active}
              // onMouseDown (not onClick) so the select fires before the input's blur.
              onMouseDown={e => { e.preventDefault(); select(place) }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                'flex min-h-[44px] cursor-pointer items-center gap-2.5 px-3.5 text-[14px] text-ink',
                'transition-colors', i === active ? 'bg-fill' : 'hover:bg-fill',
              )}
            >
              <MapPin size={15} className="shrink-0 text-muted" aria-hidden="true" />
              <span className="truncate">{place}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
