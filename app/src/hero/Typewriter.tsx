import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { HERO_DESTINATIONS } from '../data/heroDestinations'

/**
 * Animated placeholder for the hero search pill (NOT a real input).
 *
 * Sequence (looping forever):
 *   "Where do you want to go?" -> hold -> delete
 *   -> each HERO_DESTINATIONS entry (type -> hold -> delete)
 *   -> "Anywhere." (type -> longer hold -> delete)
 *   -> back to the start.
 *
 * `onTermChange` is called with the *complete* word whenever a full word is on
 * screen, so the Explorer map (A5) can highlight the matching node. For the
 * opening prompt and the finale we pass '' (no map node to light).
 */

const PROMPT = 'Where do you want to go?'
const FINALE = 'Anywhere.'

// Tuned for a premium, unhurried feel.
const TYPE_MS = 55 // per character while typing
const DELETE_MS = 35 // per character while deleting
const HOLD_MS = 1600 // pause once a word is fully typed
const HOLD_FINALE_MS = 2200 // the finale lingers a touch longer
const PAUSE_AFTER_DELETE_MS = 400 // beat between words

// Reduced-motion: calm rotation with a gentle opacity fade, no per-char typing.
const ROTATE_MS = 2500
const FADE_MS = 320

/** The full ordered list of words the typewriter cycles through. */
const WORDS: string[] = [PROMPT, ...HERO_DESTINATIONS, FINALE]

/** Words that map to a real destination node (prompt + finale do not). */
function termFor(word: string): string {
  return word === PROMPT || word === FINALE ? '' : word
}

export interface TypewriterProps {
  /** Called with the current complete word (or '' for prompt/finale). */
  onTermChange?: (term: string) => void
  className?: string
}

export function Typewriter({ onTermChange, className }: TypewriterProps) {
  const reduce = useReducedMotion()

  if (reduce) {
    return <ReducedTypewriter onTermChange={onTermChange} className={className} />
  }
  return <AnimatedTypewriter onTermChange={onTermChange} className={className} />
}

/* ------------------------------------------------------------------ */
/* Full character-by-character typewriter                              */
/* ------------------------------------------------------------------ */

function AnimatedTypewriter({ onTermChange, className }: TypewriterProps) {
  const [text, setText] = useState('')

  // Keep the latest callback in a ref so the driver effect can stay mount-once
  // (no re-subscribe churn) without going stale.
  const onTermChangeRef = useRef(onTermChange)
  useEffect(() => {
    onTermChangeRef.current = onTermChange
  }, [onTermChange])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let cancelled = false

    let wordIndex = 0
    let charIndex = 0
    let phase: 'typing' | 'holding' | 'deleting' | 'pausing' = 'typing'

    const schedule = (fn: () => void, ms: number) => {
      timer = setTimeout(() => {
        if (!cancelled) fn()
      }, ms)
    }

    const tick = () => {
      if (cancelled) return
      const word = WORDS[wordIndex]

      switch (phase) {
        case 'typing': {
          charIndex += 1
          setText(word.slice(0, charIndex))
          if (charIndex >= word.length) {
            // Word fully shown -> announce its term, then hold.
            onTermChangeRef.current?.(termFor(word))
            phase = 'holding'
            schedule(tick, word === FINALE ? HOLD_FINALE_MS : HOLD_MS)
          } else {
            schedule(tick, TYPE_MS)
          }
          break
        }
        case 'holding': {
          phase = 'deleting'
          schedule(tick, DELETE_MS)
          break
        }
        case 'deleting': {
          charIndex -= 1
          setText(word.slice(0, Math.max(0, charIndex)))
          if (charIndex <= 0) {
            phase = 'pausing'
            schedule(tick, PAUSE_AFTER_DELETE_MS)
          } else {
            schedule(tick, DELETE_MS)
          }
          break
        }
        case 'pausing': {
          wordIndex = (wordIndex + 1) % WORDS.length
          charIndex = 0
          phase = 'typing'
          schedule(tick, TYPE_MS)
          break
        }
      }
    }

    // First character after a brief beat.
    schedule(tick, TYPE_MS)

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [])

  return (
    <TypewriterShell className={className}>
      <span data-testid="typewriter-text">{text}</span>
      <Caret />
    </TypewriterShell>
  )
}

/* ------------------------------------------------------------------ */
/* Reduced-motion: calm word rotation with opacity fade                */
/* ------------------------------------------------------------------ */

function ReducedTypewriter({ onTermChange, className }: TypewriterProps) {
  const [index, setIndex] = useState(0)
  const [visible, setVisible] = useState(true)

  const onTermChangeRef = useRef(onTermChange)
  useEffect(() => {
    onTermChangeRef.current = onTermChange
  }, [onTermChange])

  // Announce the first word immediately.
  useEffect(() => {
    onTermChangeRef.current?.(termFor(WORDS[0]))
  }, [])

  useEffect(() => {
    let fadeTimer: ReturnType<typeof setTimeout> | undefined
    const interval = setInterval(() => {
      // Fade out, swap, fade back in.
      setVisible(false)
      fadeTimer = setTimeout(() => {
        setIndex((i) => {
          const next = (i + 1) % WORDS.length
          onTermChangeRef.current?.(termFor(WORDS[next]))
          return next
        })
        setVisible(true)
      }, FADE_MS)
    }, ROTATE_MS)

    return () => {
      clearInterval(interval)
      if (fadeTimer) clearTimeout(fadeTimer)
    }
  }, [])

  return (
    <TypewriterShell className={className}>
      <span
        data-testid="typewriter-text"
        style={{
          opacity: visible ? 1 : 0,
          transition: `opacity ${FADE_MS}ms ease`,
        }}
      >
        {WORDS[index]}
      </span>
    </TypewriterShell>
  )
}

/* ------------------------------------------------------------------ */
/* Shared chrome                                                       */
/* ------------------------------------------------------------------ */

/**
 * Reserves vertical space (min-height via line) and pins the row so the
 * caret/text never reflow surrounding layout. The text truncates rather than
 * wrapping, keeping the line height stable.
 */
function TypewriterShell({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <span
      aria-hidden="true"
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        minWidth: 0,
      }}
    >
      {children}
    </span>
  )
}

function Caret() {
  return (
    <>
      <span
        aria-hidden="true"
        style={{
          display: 'inline-block',
          width: '1px',
          alignSelf: 'stretch',
          marginLeft: '2px',
          background: 'currentColor',
          animation: 'voyager-caret-blink 1.05s steps(1, end) infinite',
        }}
      />
      <style>{`
        @keyframes voyager-caret-blink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
      `}</style>
    </>
  )
}

export default Typewriter
