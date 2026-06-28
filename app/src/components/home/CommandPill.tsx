import { forwardRef, useImperativeHandle, useRef, useState, useId, useEffect } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { X, Loader2, MapPin, Calendar } from 'lucide-react'
import { usePlaceSearch } from '../../data/usePlaceSearch'
import { resolveCommitLabel } from '../../lib/destination-commit'
import { warmCover } from '../../lib/cover-prefetch'
import { formatRangeChip, type DateRange } from '../../lib/range-calendar'
import { RangeCalendar } from './RangeCalendar'
import { Typewriter } from '../../hero/Typewriter'
import { cn } from '../../lib/utils'

// Renders only over the dark cinematic home hero — hence the fixed dark-glass rgba tokens (mirrors HeroSearchPill), not theme tokens.

/** Minimum chars before suggestions appear (mirrors usePlaceSearch gate). */
const MIN_QUERY = 3
/** Debounce before querying Photon (ms). */
const DEBOUNCE_MS = 280

export interface CommandPillCommit {
  destination: string   // committed clean label (top-result rule)
  start?: string        // YYYY-MM-DD, omitted when datesTBD
  end?: string          // YYYY-MM-DD, omitted when datesTBD
  datesTBD: boolean
}

export interface CommandPillProps {
  onCommit: (c: CommandPillCommit) => Promise<void> | void
  pending?: boolean     // parent-driven "creating" state
  error?: string | null // parent-driven inline error
  /** Forwarded to the Typewriter placeholder so the cinematic hero background cycles. */
  onWordStart?: (word: string) => void
  className?: string
}

export interface CommandPillHandle {
  /** `preventScroll` lets a caller focus without the browser jumping the input
   *  into view — so a smooth scroll-to-top isn't interrupted. */
  focus: (opts?: FocusOptions) => void
}

type Phase = 'destination' | 'dates'

export const CommandPill = forwardRef<CommandPillHandle, CommandPillProps>(
  function CommandPill({ onCommit, pending = false, error = null, onWordStart, className }, ref) {
    const [phase, setPhase] = useState<Phase>('destination')
    const [text, setText] = useState('')
    const [focused, setFocused] = useState(false)
    const [debounced, setDebounced] = useState('')
    const [destination, setDestination] = useState<string | null>(null)
    const [acOpen, setAcOpen] = useState(false)
    const [active, setActive] = useState(-1)
    const [range, setRange] = useState<DateRange>({ start: null, end: null })
    const [calOpen, setCalOpen] = useState(false)
    const [datesTBD, setDatesTBD] = useState(false)

    const reduce = useReducedMotion()
    const inputRef = useRef<HTMLInputElement>(null)
    const listId = useId()
    const optionId = (i: number) => `${listId}-opt-${i}`

    useImperativeHandle(ref, () => ({ focus: (opts?: FocusOptions) => inputRef.current?.focus(opts) }), [])

    // Debounce text before hitting Photon — mirrors DestinationInput pattern.
    useEffect(() => {
      const t = setTimeout(() => setDebounced(text), DEBOUNCE_MS)
      return () => clearTimeout(t)
    }, [text])

    const { places, loading } = usePlaceSearch(debounced)

    // Keep active index in range as suggestions change.
    useEffect(() => { setActive(-1) }, [places])

    const showList = acOpen && text.trim().length >= MIN_QUERY && (loading || places.length > 0)

    // ── Destination commit ──────────────────────────────────────────────────
    const commitDestination = (chosenLabel?: string | null) => {
      const label = resolveCommitLabel({
        chosen: chosenLabel ?? null,
        raw: text,
        suggestions: places,
      })
      if (!label) return
      // Drop the mobile soft keyboard before the calendar opens — otherwise it
      // covers the lower half of the calendar (incl. "Don't know dates yet").
      // Blur while the input is still mounted (this handler runs in the
      // destination phase, before setPhase unmounts it).
      inputRef.current?.blur()
      setDestination(label)
      setAcOpen(false)
      setActive(-1)
      void warmCover(label)
      setPhase('dates')
      setCalOpen(true)
    }

    // ── Clear back to destination entry ────────────────────────────────────
    const clearDestination = () => {
      setDestination(null)
      setText('')
      setDebounced('')
      setRange({ start: null, end: null })
      setDatesTBD(false)
      setCalOpen(false)
      setPhase('destination')
      requestAnimationFrame(() => inputRef.current?.focus())
    }

    // ── Confirm (CTA) ──────────────────────────────────────────────────────
    const canConfirm = !!destination && (datesTBD || (!!range.start && !!range.end))

    const confirm = () => {
      if (!canConfirm || pending) return
      void onCommit({
        destination: destination!,
        ...(datesTBD ? {} : { start: range.start!, end: range.end! }),
        datesTBD,
      })
    }

    // ── Keyboard handler for the destination input ─────────────────────────
    // Mirrors DestinationInput exactly:
    //   Esc priority: autocomplete open → close (stopPropagation); else blur.
    //   ↑/↓: move active index (wrapping).
    //   Enter: if active >= 0 commit that suggestion; else commit top result /
    //          raw text; also handle CTA confirm when phase === 'dates'.
    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        if (showList) {
          e.stopPropagation()
          e.preventDefault()
          setAcOpen(false)
          setActive(-1)
        } else {
          e.preventDefault()
          e.stopPropagation()
          inputRef.current?.blur()
        }
        return
      }

      if (e.key === 'ArrowDown') {
        if (showList && places.length > 0) {
          e.preventDefault()
          setActive(i => (i + 1) % places.length)
        }
        return
      }

      if (e.key === 'ArrowUp') {
        if (showList && places.length > 0) {
          e.preventDefault()
          setActive(i => (i <= 0 ? places.length - 1 : i - 1))
        }
        return
      }

      if (e.key === 'Enter') {
        if (phase === 'destination') {
          e.preventDefault()
          if (showList && active >= 0 && active < places.length) {
            // Highlighted suggestion → commit it
            commitDestination(places[active])
          } else {
            // No highlight → commit top result / raw text
            commitDestination(null)
          }
        }
        // phase === 'dates': Enter handled by CTA button naturally
      }
    }

    // ── Esc from the date-phase container (calendar open → close it) ───────
    const onContainerKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape' && phase === 'dates' && calOpen) {
        e.stopPropagation()
        e.preventDefault()
        setCalOpen(false)
      }
    }

    // ── RangeCalendar callbacks ────────────────────────────────────────────
    const handleRangeChange = (next: DateRange) => {
      setRange(next)
      setDatesTBD(false)
    }

    const handleSkip = () => {
      setDatesTBD(true)
      setRange({ start: null, end: null })
      setCalOpen(false)
    }

    // ── Date chip label ────────────────────────────────────────────────────
    const dateChipLabel = datesTBD
      ? 'Dates TBD'
      : range.start
      ? formatRangeChip(range)
      : 'Choose dates'

    const dateChipComplete = datesTBD || (!!range.start && !!range.end)

    return (
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions
      <div
        className={cn('relative', className)}
        onKeyDown={phase === 'dates' ? onContainerKeyDown : undefined}
      >
        {/* ── Main pill ─────────────────────────────────────────────────── */}
        <div
          className={cn(
            'flex items-center gap-2 rounded-full p-1.5 pl-5',
            // Glassy treatment — mirrors HeroSearchPill
            'border border-white/20 bg-[rgba(20,20,26,.34)] backdrop-blur-xl',
            'shadow-[0_10px_34px_rgba(0,0,0,.30)]',
            'transition-[border-color] duration-200',
            'hover:border-white/30 focus-within:border-white/40',
          )}
          style={{ transitionTimingFunction: 'cubic-bezier(.22,1,.36,1)' }}
        >
          {/* Destination chip (phase "dates") */}
          {phase === 'dates' && destination && (
            <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5">
              <MapPin size={13} className="shrink-0 text-white/70" aria-hidden="true" />
              <span className="max-w-[140px] truncate text-[13.5px] font-medium text-white">
                {destination}
              </span>
              <button
                type="button"
                aria-label={`Clear destination ${destination}`}
                disabled={pending}
                onClick={clearDestination}
                className="ml-0.5 grid h-9 w-9 place-items-center rounded-full text-white/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:pointer-events-none disabled:opacity-40"
              >
                <X size={13} />
              </button>
            </div>
          )}

          {/* Destination input (phase "destination") */}
          {phase === 'destination' && (
            <div className="relative min-w-0 flex-1">
              <input
                ref={inputRef}
                type="text"
                role="combobox"
                aria-expanded={showList}
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={active >= 0 ? optionId(active) : undefined}
                aria-label="Where do you want to go?"
                autoComplete="off"
                disabled={pending}
                value={text}
                // Native placeholder kept empty while the Typewriter overlay is active.
                placeholder={text === '' && !focused ? '' : 'Where to?'}
                onChange={e => {
                  setText(e.target.value)
                  setAcOpen(true)
                  setActive(-1)
                }}
                onFocus={() => {
                  setFocused(true)
                  if (text.trim().length >= MIN_QUERY) setAcOpen(true)
                }}
                onBlur={() => {
                  setFocused(false)
                  setAcOpen(false)
                }}
                onKeyDown={onKeyDown}
                className={cn(
                  'w-full bg-transparent text-[15px] leading-[1.4] text-white outline-none',
                  'placeholder:text-white/50 disabled:opacity-50',
                )}
              />
              {text === '' && !focused && (
                <Typewriter
                  onWordStart={onWordStart}
                  className="pointer-events-none absolute inset-0 flex items-center text-[15px] leading-[1.4] text-white/50"
                />
              )}
            </div>
          )}

          {/* Date token (phase "dates") */}
          {phase === 'dates' && (
            <button
              type="button"
              aria-label="Choose travel dates"
              disabled={pending}
              onClick={() => setCalOpen(c => !c)}
              className={cn(
                // Fixed width: the label changes (Choose dates → Jul 14 → Jul 14 → Jul 18)
                // but the token must NOT resize, or the centered pill (and the anchored
                // calendar) re-centers and visibly jumps when you pick the first date.
                'flex w-[152px] shrink-0 items-center gap-2 text-[13.5px] font-medium',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:pointer-events-none disabled:opacity-50',
                dateChipComplete ? 'text-gold' : 'text-white/60',
              )}
            >
              <Calendar size={14} className="shrink-0" aria-hidden="true" />
              <span className="truncate">{dateChipLabel}</span>
            </button>
          )}

          {/* Loading spinner (destination phase, typing) */}
          {phase === 'destination' && loading && (
            <span className="shrink-0 text-white/50" aria-hidden="true">
              <Loader2 size={15} className="animate-spin" />
            </span>
          )}

          {/* CTA button */}
          <button
            type="button"
            disabled={!canConfirm || pending}
            onClick={confirm}
            aria-label={pending ? 'Creating your trip…' : 'Plan it'}
            className={cn(
              'relative inline-flex h-[46px] shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-full px-5',
              'bg-sig font-sans font-medium text-[14px] text-white',
              'shadow-[0_4px_14px_rgba(0,0,0,.25)]',
              'transition-[opacity,background-color] duration-150',
              'hover:brightness-110 active:translate-y-px',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
              (!canConfirm || pending) && 'cursor-not-allowed opacity-50',
            )}
          >
            {pending ? (
              <>
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                <span>Creating…</span>
              </>
            ) : (
              <>
                <span>Plan it</span>
                <svg
                  aria-hidden="true"
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="none"
                  className="shrink-0"
                >
                  <path
                    d="M3 8h9M8.5 4l4 4-4 4"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </>
            )}
          </button>
        </div>

        {/* ── Autocomplete listbox (phase "destination") — fades/scales in ── */}
        <AnimatePresence>
          {showList && (
          <motion.ul
            key="ac"
            id={listId}
            role="listbox"
            aria-label="Destination suggestions"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: reduce ? 0.12 : 0.18, ease: [0.22, 1, 0.36, 1] }}
            style={{ transformOrigin: 'top center' }}
            className={cn(
              'absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-2xl',
              'border border-white/12 bg-[rgba(16,14,20,.92)] backdrop-blur-xl',
              'shadow-[0_18px_50px_rgba(0,0,0,.5)]',
            )}
          >
            {places.length === 0 && loading && (
              <li
                className="flex min-h-[44px] items-center gap-2.5 px-4 text-[13px] text-white/50"
                aria-hidden="true"
              >
                <Loader2 size={14} className="animate-spin shrink-0" />
                Searching…
              </li>
            )}
            {places.map((place, i) => (
              <li
                key={place}
                id={optionId(i)}
                role="option"
                aria-selected={i === active}
                // onMouseDown fires before the input's blur — intentional (mirrors DestinationInput).
                onMouseDown={e => {
                  e.preventDefault()
                  commitDestination(place)
                }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  'flex min-h-[44px] cursor-pointer items-center gap-2.5 px-4 text-[14px] text-white',
                  'transition-colors',
                  i === active ? 'bg-white/10' : 'hover:bg-white/8',
                )}
              >
                <MapPin size={14} className="shrink-0 text-white/50" aria-hidden="true" />
                <span className="truncate">{place}</span>
              </li>
            ))}
          </motion.ul>
          )}
        </AnimatePresence>

        {/* ── Range calendar overlay (phase "dates") — fades/scales in from the pill ── */}
        <AnimatePresence>
          {phase === 'dates' && calOpen && (
            <motion.div
              key="cal"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.97 }}
              transition={{ duration: reduce ? 0.12 : 0.2, ease: [0.22, 1, 0.36, 1] }}
              style={{ transformOrigin: 'top center' }}
              className="absolute left-0 top-full z-20 mt-2"
            >
              <RangeCalendar
                value={range}
                onChange={handleRangeChange}
                onSkip={handleSkip}
                onConfirm={() => setCalOpen(false)}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Inline error ───────────────────────────────────────────────── */}
        {error && (
          <p
            role="alert"
            className="mt-2 px-1 text-[12.5px] text-white/70"
          >
            {error}
          </p>
        )}
      </div>
    )
  },
)

export default CommandPill
