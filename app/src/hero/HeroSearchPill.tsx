import { useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { Typewriter } from './Typewriter'
import { cn } from '../lib/utils'

/**
 * The hero search pill.
 *
 * A single fully-rounded glassy pill that reads as ONE component: a real text
 * input on the left and a fully-rounded submit button on the right (no square
 * corner anywhere). It floats over the video hero, so the treatment is
 * translucent + backdrop-blurred with a hairline border.
 *
 * When the field is empty AND unfocused, the animated <Typewriter> placeholder
 * is overlaid (left-aligned, same metrics as the input). As soon as the user
 * focuses or types, the Typewriter yields to the real input + native caret.
 *
 * Microinteractions are GPU-only (transform/opacity): on hover/focus-within the
 * pill gains a soft claret glow, expands very slightly, and the submit arrow
 * nudges right. All motion is neutralized under reduced-motion (states stay
 * legible — just no movement).
 */

const EASE = 'cubic-bezier(.22,1,.36,1)'

export interface HeroSearchPillProps {
  /** Called with the typed value on Enter or button click. Default routes to /auth. */
  onSubmit: (destination: string) => void
  /** Forwarded from the Typewriter so the Explorer map can react to the current term. */
  onTermChange?: (term: string) => void
  className?: string
}

export function HeroSearchPill({ onSubmit, onTermChange, className }: HeroSearchPillProps) {
  const reduce = useReducedMotion()
  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)

  // Show the animated placeholder only when there's nothing real to show.
  const showTypewriter = value.length === 0 && !focused

  const submit = () => onSubmit(value)

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
          'flex items-center gap-2 rounded-full p-2 pl-5',
          // Glassy treatment so it reads over the video hero.
          'border border-white/25 bg-[rgba(20,20,26,.34)] backdrop-blur-xl',
          // Soft claret-tinted glow + ring + slight expand on hover / focus-within.
          'shadow-[0_8px_30px_rgba(0,0,0,.28)]',
          'transition-[transform,box-shadow,border-color]',
          !reduce && 'duration-200 will-change-transform',
          !reduce &&
            'group-focus-within/pill:scale-[1.015] group-hover/pill:scale-[1.01]',
          // Glow + brighter hairline on hover/focus (legible in both motion modes).
          'group-hover/pill:border-white/40 group-focus-within/pill:border-white/45',
          'group-hover/pill:shadow-[0_10px_36px_rgba(0,0,0,.32),0_0_0_3px_rgba(156,61,58,.30)]',
          'group-focus-within/pill:shadow-[0_12px_40px_rgba(0,0,0,.36),0_0_18px_rgba(156,61,58,.20),0_0_0_3px_rgba(156,61,58,.38)]',
        )}
        style={{ transitionTimingFunction: EASE }}
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
            className={cn(
              'w-full bg-transparent text-[15px] leading-[1.4] text-white outline-none',
              'placeholder:text-white/70',
            )}
          />
          {showTypewriter && (
            <Typewriter
              onTermChange={onTermChange}
              className="pointer-events-none absolute inset-0 flex items-center text-[15px] leading-[1.4] text-white/70"
            />
          )}
        </div>

        <button
          type="submit"
          aria-label="Start planning"
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-full',
            'min-h-[44px] px-5 py-3 font-sans font-bold text-[14.5px]',
            'bg-sig-btn text-white',
            'transition-[transform,filter,box-shadow]',
            !reduce && 'duration-200',
            'hover:brightness-110 active:translate-y-px',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
          )}
          style={{ transitionTimingFunction: EASE }}
        >
          <span>Start planning</span>
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            className={cn(
              'transition-transform',
              !reduce && 'duration-200',
              // Arrow nudges right on hover/focus of the whole pill.
              !reduce &&
                'group-hover/pill:translate-x-1 group-focus-within/pill:translate-x-1',
            )}
            style={{ transitionTimingFunction: EASE }}
          >
            <path
              d="M3 8h9M8.5 4l4 4-4 4"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </form>
  )
}

export default HeroSearchPill
