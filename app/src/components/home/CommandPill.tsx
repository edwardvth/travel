import { forwardRef, useImperativeHandle, useRef, useState, useId, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence, useReducedMotion, useAnimationControls } from 'framer-motion'
import { X, Loader2, MapPin, Calendar } from 'lucide-react'
import { usePlaceSearch } from '../../data/usePlaceSearch'
import { deriveAutocompleteStatus, resolveContinue } from '../../lib/pill-resolution'
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
/** On phones, focusing the input scrolls so the hero eyebrow (PLAN · WALK ·
 *  REMEMBER) lands ~this fraction down the viewport — a small gap below the top —
 *  lifting the pill clear of the soft keyboard without going all the way up. */
const EYEBROW_TOP_GAP_FRACTION = 0.06
/** Inline hint shown when the user tries to continue without a resolvable place. */
const INVALID_PLACE_MSG = 'Choose a valid place from the list.'

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
    // Strict resolution gate, kept SEPARATE from the raw `text`: the flow may only
    // advance with a real prediction, never raw text. `pendingSubmit` records an
    // early "continue" (pressed while predictions were still loading) so the
    // dropdown can open the moment results land; `invalidMsg` is the inline hint.
    const [pendingSubmit, setPendingSubmit] = useState(false)
    const [invalidMsg, setInvalidMsg] = useState<string | null>(null)

    const reduce = useReducedMotion()
    const shakeControls = useAnimationControls()
    const inputRef = useRef<HTMLInputElement>(null)
    const pillBarRef = useRef<HTMLDivElement>(null)
    // Fixed-position coords for the (portaled) calendar — see the measure effect.
    const [calPos, setCalPos] = useState<{ top: number; left: number } | null>(null)
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

    // The calendar is rendered in a PORTAL (document.body) so the hero's
    // overflow-hidden can't clip it on short mobile viewports. Measure the pill
    // while the calendar is open (and on scroll/resize) so the portal sits right
    // below it. We keep the last position while closed so the exit animation has
    // somewhere to play; we clear it only when leaving the dates phase.
    useEffect(() => {
      if (phase !== 'dates') { setCalPos(null); return }
      if (!calOpen) return
      const measure = () => {
        const r = pillBarRef.current?.getBoundingClientRect()
        if (r) setCalPos({ top: r.bottom + 8, left: r.left })
      }
      measure()
      window.addEventListener('resize', measure)
      window.addEventListener('scroll', measure, true)
      return () => {
        window.removeEventListener('resize', measure)
        window.removeEventListener('scroll', measure, true)
      }
    }, [phase, calOpen])

    // Resolved autocomplete state, derived and kept strictly apart from raw `text`.
    // `settled` = the debounce has caught up to what's typed, so `places` reflects
    // the CURRENT text rather than a mid-debounce stale query. Combined with
    // TanStack keying on `debounced` (late responses for old queries never land in
    // `places`), this is the stale-result guard — no request IDs needed.
    const trimmed = text.trim()
    const autocompleteStatus = deriveAutocompleteStatus({
      trimmedLength: trimmed.length,
      minQuery: MIN_QUERY,
      settled: debounced.trim() === trimmed,
      loading,
      predictionCount: places.length,
    })

    // Keep the dropdown open during the invalid hint too, so the autofill stays
    // visible and keeps loading toward results instead of vanishing.
    const showList =
      acOpen && (autocompleteStatus === 'loading' || autocompleteStatus === 'ready' || invalidMsg !== null)

    // Deferred submit: if the user pressed "continue" too early (pendingSubmit),
    // act the moment the already-in-flight request resolves — open the dropdown if
    // predictions arrived (they can press Enter again for the top result), or show
    // the hint if none did. We don't trigger a new request; we just react.
    useEffect(() => {
      if (!pendingSubmit) return
      if (autocompleteStatus === 'ready') {
        setAcOpen(true)
        setActive(-1)
        inputRef.current?.focus()
        setPendingSubmit(false)
      } else if (autocompleteStatus === 'empty' || autocompleteStatus === 'idle') {
        setInvalidMsg(INVALID_PLACE_MSG)
        setAcOpen(true)
        setPendingSubmit(false)
      }
      // 'loading' → keep waiting.
    }, [pendingSubmit, autocompleteStatus])

    // ── Advance to the dates step with a RESOLVED place ─────────────────────
    // Only ever called with a real autocomplete prediction (top result, or a
    // clicked/highlighted suggestion) — never raw typed text. Because selecting a
    // place leaves the editable input behind, a resolved place can never go stale
    // for new text: to change it the user clears back to an empty input.
    const advanceWith = (label: string) => {
      const clean = label.trim()
      if (!clean) return
      // Drop the mobile soft keyboard before the calendar opens — otherwise it
      // covers the lower half of the calendar (incl. "Don't know dates yet").
      inputRef.current?.blur()
      setDestination(clean)
      setAcOpen(false)
      setActive(-1)
      setPendingSubmit(false)
      setInvalidMsg(null)
      void warmCover(clean)
      setPhase('dates')
      setCalOpen(true)
    }

    // A quick, subtle "not yet" shake — purely visual. It never touches the
    // query, so the typing-triggered autocomplete request keeps flowing as if the
    // shake never happened. Skipped under reduced motion.
    const triggerShake = () => {
      if (reduce) return
      void shakeControls.start({
        x: [0, -5, 5, -4, 4, -2, 2, 0],
        transition: { duration: 0.35, ease: 'easeInOut' },
      })
    }

    // ── The ONE guarded "continue" path (Enter, submit button, mobile Go) ────
    // Raw text can never advance — `resolveContinue` only yields `advance` with a
    // resolved prediction (highlighted, else top result).
    const attemptContinue = () => {
      const action = resolveContinue(autocompleteStatus, active, places)
      if (action.kind === 'advance') {
        advanceWith(action.label)
        return
      }
      if (action.kind === 'wait') {
        // Still resolving → "not yet": shake, keep the typed text + focus, hold the
        // dropdown open, and remember the intent so it populates the instant
        // results arrive. No new request is fired (the typing-triggered one runs on).
        triggerShake()
        setPendingSubmit(true)
        setInvalidMsg(null)
        setAcOpen(true)
        inputRef.current?.focus()
        return
      }
      // 'invalid' — nothing resolvable (too short / no matches): shake + hint, but
      // keep the dropdown open and searching so results can still surface as the
      // user adjusts the text.
      triggerShake()
      setPendingSubmit(false)
      setInvalidMsg(INVALID_PLACE_MSG)
      setAcOpen(true)
      inputRef.current?.focus()
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
    //   Esc: autocomplete open → close (stopPropagation); else blur.
    //   ↑/↓: move the active suggestion (wrapping).
    //   Enter: route through attemptContinue — advances ONLY with a resolved
    //          prediction (highlighted / top result), never raw text.
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
          attemptContinue()
        }
        // phase === 'dates': Enter handled by the CTA button naturally.
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

    // On a phone, focusing the input raises the soft keyboard over the lower
    // screen. Scroll so the hero eyebrow (PLAN · WALK · REMEMBER) sits near the
    // top with a small gap — this lifts the pill clear of the keyboard while
    // keeping the hero context in view. Only ever scrolls up, waits a beat for
    // the keyboard to appear, and bails if the user already blurred.
    const nudgeAboveKeyboard = () => {
      if (typeof window === 'undefined') return
      if (!window.matchMedia('(max-width: 767px)').matches) return
      window.setTimeout(() => {
        if (document.activeElement !== inputRef.current) return
        const eyebrow = document.querySelector('[data-hero-eyebrow]')
        if (!eyebrow) return
        const delta = eyebrow.getBoundingClientRect().top - window.innerHeight * EYEBROW_TOP_GAP_FRACTION
        if (delta > 24) window.scrollBy({ top: delta, behavior: reduce ? 'auto' : 'smooth' })
      }, 300)
    }

    // ── Date chip label ────────────────────────────────────────────────────
    const dateChipLabel = datesTBD
      ? 'Dates TBD'
      : range.start
      ? formatRangeChip(range)
      : 'Choose dates'

    const dateChipComplete = datesTBD || (!!range.start && !!range.end)

    // The primary confirm CTA. Defined once, rendered wherever it's needed: INSIDE
    // the pill on the destination step (all sizes) and the dates step on desktop,
    // but floating ABOVE the pill on the dates step on MOBILE — where the full
    // "Plan it →" label can't share the row with the chip + date token.
    const renderCta = () => {
      // Destination step: the CTA is a guarded "continue" — same rules as Enter,
      // so attemptContinue never advances on raw text and only enables once
      // something is typed. Dates step: it's the trip-creating confirm.
      const inDestination = phase === 'destination'
      const ctaDisabled = inDestination ? pending || trimmed.length === 0 : !canConfirm || pending
      return (
      <button
        type="button"
        disabled={ctaDisabled}
        onClick={inDestination ? attemptContinue : confirm}
        aria-label={pending ? 'Creating your trip…' : 'Plan it'}
        className={cn(
          'relative inline-flex h-[46px] shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-full px-5',
          'bg-sig font-sans font-medium text-[14px] text-white',
          'shadow-[0_4px_14px_rgba(0,0,0,.25)]',
          'transition-[opacity,background-color] duration-150',
          'hover:brightness-110 active:translate-y-px',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
          ctaDisabled && 'cursor-not-allowed opacity-50',
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
      )
    }

    return (
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions
      <div
        className={cn(
          // Content-sized so the pill fits each phase. ~400px min on the destination
          // step (room for the input); the dates step is content-sized around its
          // contents — [chip + token] on mobile (CTA floats above) or
          // [chip + token + CTA] on desktop. Capped to the viewport throughout.
          'relative mx-auto w-fit max-w-[calc(100vw_-_2.5rem)]',
          phase === 'destination' && 'min-w-[min(400px,calc(100vw_-_2.5rem))]',
          className,
        )}
        onKeyDown={phase === 'dates' ? onContainerKeyDown : undefined}
      >
        {/* ── Confirm CTA, floating ABOVE the pill — MOBILE ONLY (sm:hidden) ──
            On a narrow phone "Plan it →" can't share the pill row with the chip
            + date token, so it floats above (absolute, bottom-full → never pushes
            the pill or the open calendar down). Shown once the range is complete
            (canConfirm) or the calendar is closed. On desktop it lives inside the
            pill instead (there's room) — see the in-pill CTA below. */}
        {phase === 'dates' && (canConfirm || !calOpen) && (
          <motion.div
            key="cta-above"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduce ? 0.12 : 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-x-0 bottom-full mb-2 flex justify-center sm:hidden"
          >
            {renderCta()}
          </motion.div>
        )}

        {/* ── "Not yet — choose a real place" hint, floating ABOVE the pill ──
            Appears from the top so it never covers the autocomplete dropdown,
            which stays open and searching below the pill. */}
        {phase === 'destination' && invalidMsg && (
          <motion.div
            key="invalid-msg"
            role="alert"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduce ? 0.12 : 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-x-0 bottom-full mb-2 flex justify-center"
          >
            <span className="rounded-full border border-white/15 bg-[rgba(20,20,26,.72)] px-3.5 py-1.5 text-[12.5px] font-medium text-white/90 shadow-[0_6px_20px_rgba(0,0,0,.3)] backdrop-blur-xl">
              {invalidMsg}
            </span>
          </motion.div>
        )}

        {/* ── Main pill (shakes on a "not yet" continue attempt) ──────────── */}
        <motion.div
          ref={pillBarRef}
          animate={shakeControls}
          initial={false}
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
            <div className="flex min-w-0 items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5">
              <MapPin size={13} className="shrink-0 text-white/70" aria-hidden="true" />
              <span className="min-w-0 max-w-[140px] truncate text-[13.5px] font-medium text-white">
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
                  // Editing supersedes any early-submit intent and clears the hint;
                  // the new text must resolve on its own before it can advance.
                  setPendingSubmit(false)
                  setInvalidMsg(null)
                }}
                onFocus={() => {
                  setFocused(true)
                  if (text.trim().length >= MIN_QUERY) setAcOpen(true)
                  nudgeAboveKeyboard()
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
              {text === '' && (
                <Typewriter
                  onWordStart={onWordStart}
                  // Stays mounted while the input is empty — even when focused — so it
                  // keeps driving the hero video's crossfade (onWordStart). When focused
                  // it's just hidden, letting the native "Where to?" placeholder show.
                  // Unmounting it on focus is what froze the video looping one clip.
                  className={cn(
                    'pointer-events-none absolute inset-0 flex items-center text-[15px] leading-[1.4] text-white/50',
                    focused && 'opacity-0',
                  )}
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

          {/* Loading spinner — while predictions are resolving (debounce or fetch). */}
          {phase === 'destination' && autocompleteStatus === 'loading' && (
            <span className="shrink-0 text-white/50" aria-hidden="true">
              <Loader2 size={15} className="animate-spin" />
            </span>
          )}

          {/* CTA inside the pill — destination step (all sizes), and the dates step
              on DESKTOP (sm+) where there's room beside the chip + token. On mobile
              the dates-step CTA floats above instead (see the cta-above block). */}
          {phase === 'destination' && renderCta()}
          {phase === 'dates' && <div className="hidden shrink-0 sm:flex">{renderCta()}</div>}
        </motion.div>

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
            {autocompleteStatus !== 'ready' && (
              <li
                className="flex min-h-[44px] items-center gap-2.5 px-4 text-[13px] text-white/50"
                aria-hidden="true"
              >
                <Loader2 size={14} className="animate-spin shrink-0" />
                Searching…
              </li>
            )}
            {autocompleteStatus === 'ready' && places.map((place, i) => (
              <li
                key={place}
                id={optionId(i)}
                role="option"
                aria-selected={i === active}
                // onMouseDown fires before the input's blur — intentional (mirrors DestinationInput).
                onMouseDown={e => {
                  e.preventDefault()
                  advanceWith(place)
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
        {calPos && createPortal(
          <AnimatePresence>
            {phase === 'dates' && calOpen && (
              <motion.div
                key="cal"
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.97 }}
                transition={{ duration: reduce ? 0.12 : 0.2, ease: [0.22, 1, 0.36, 1] }}
                style={{ position: 'fixed', top: calPos.top, left: calPos.left, zIndex: 60, transformOrigin: 'top left' }}
              >
                <RangeCalendar
                  value={range}
                  onChange={handleRangeChange}
                  // No auto-close on the 2nd pick: the calendar stays open with the
                  // range shown so the user can adjust, hit "Confirm dates", or use
                  // the "Plan it →" CTA that now appears above the pill once the range
                  // is complete (see the absolute CTA below).
                  onSkip={handleSkip}
                  onConfirm={() => setCalOpen(false)}
                />
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}

        {/* ── Inline error (trip-creation failure, from parent) ───────────── */}
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
