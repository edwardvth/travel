import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Typewriter } from './Typewriter'
import { cn } from '../lib/utils'

/**
 * The hero search pill.
 *
 * A single fully-rounded glassy pill: a real text input on the left and a
 * rounded submit CTA on the right. It floats over the cinematic hero, so the
 * treatment is translucent + backdrop-blurred with a hairline border and a
 * calm, neutral shadow — NO claret glow halo (claret is an accent, used
 * sparingly).
 *
 * When the field is empty AND unfocused, the animated <Typewriter> placeholder
 * is overlaid (left-aligned, same metrics as the input). As soon as the user
 * focuses or types, the Typewriter yields to the real input + native caret.
 *
 * Submit CTA micro-interaction: it starts as a circular claret arrow button.
 * When the opening "Where do you want to go?" prompt finishes and begins
 * deleting, it expands to reveal "Start planning"; when the finale ("Anywhere.")
 * deletes, it retracts to the circle so it never overlaps the re-typing prompt.
 * While the user is engaged (focused / has a value) it stays expanded. Under
 * reduced motion the typewriter is skipped and the CTA is expanded up-front.
 */

const EASE = [0.22, 1, 0.36, 1] as const

export interface HeroSearchPillProps {
  /** Called with the typed value on Enter or button click. Default routes to /auth. */
  onSubmit: (destination: string) => void
  /** Forwarded from the Typewriter (reserved for future destination tie-ins). */
  onTermChange?: (term: string) => void
  /** Forwarded from the Typewriter: the word that just started typing. */
  onWordStart?: (word: string) => void
  className?: string
}

export function HeroSearchPill({ onSubmit, onTermChange, onWordStart, className }: HeroSearchPillProps) {
  const reduce = useReducedMotion()
  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)
  const [ctaExpanded, setCtaExpanded] = useState(false)

  // Show the animated placeholder only when there's nothing real to show.
  const showTypewriter = value.length === 0 && !focused
  // When the user is engaged the CTA stays expanded; otherwise it follows the
  // typewriter's phase (collapsed circle during the opening prompt).
  const expanded = showTypewriter ? ctaExpanded : true

  const submit = () => onSubmit(value)
  const dur = reduce ? 0 : 0.32

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className={cn('group/pill mx-auto w-full max-w-xl', className)}
    >
      <div
        className={cn(
          'flex items-center gap-1.5 rounded-full p-1.5 pl-5',
          // Glassy treatment so it reads over the cinematic hero.
          'border border-white/20 bg-[rgba(20,20,26,.34)] backdrop-blur-xl',
          // Calm, neutral shadow — no claret glow halo.
          'shadow-[0_10px_34px_rgba(0,0,0,.30)]',
          'transition-[transform,border-color]',
          !reduce && 'duration-200 will-change-transform',
          !reduce && 'group-focus-within/pill:scale-[1.01]',
          'group-hover/pill:border-white/30 group-focus-within/pill:border-white/40',
        )}
        style={{ transitionTimingFunction: 'cubic-bezier(.22,1,.36,1)' }}
      >
        <div className="relative flex-1 min-w-0">
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            aria-label="Where do you want to go?"
            // Native placeholder kept empty: the Typewriter overlay handles it.
            className="w-full bg-transparent text-[16px] leading-[1.4] text-white outline-none placeholder:text-white/70"
          />
          {showTypewriter && (
            <Typewriter
              onTermChange={onTermChange}
              onCtaChange={setCtaExpanded}
              onWordStart={onWordStart}
              className="pointer-events-none absolute inset-0 flex items-center text-[16px] leading-[1.4] text-white/70"
            />
          )}
        </div>

        <motion.button
          type="submit"
          aria-label="Start planning"
          initial={false}
          animate={{ paddingLeft: expanded ? 20 : 0, paddingRight: expanded ? 18 : 0 }}
          transition={{ duration: dur, ease: EASE }}
          className={cn(
            'relative inline-flex h-[46px] min-w-[46px] shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-full',
            'bg-sig font-sans font-medium text-[14.5px] text-white',
            'shadow-[0_4px_14px_rgba(0,0,0,.25)]',
            'hover:brightness-110 active:translate-y-px',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
          )}
        >
          <motion.span
            initial={false}
            animate={{ maxWidth: expanded ? 180 : 0, opacity: expanded ? 1 : 0, marginRight: expanded ? 4 : 0 }}
            transition={{ duration: dur, ease: EASE }}
            className="overflow-hidden whitespace-nowrap"
          >
            Start planning
          </motion.span>
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            className={cn(
              'shrink-0 transition-transform',
              !reduce && 'duration-200 group-hover/pill:translate-x-0.5 group-focus-within/pill:translate-x-0.5',
            )}
          >
            <path
              d="M3 8h9M8.5 4l4 4-4 4"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </motion.button>
      </div>
    </form>
  )
}

export default HeroSearchPill
