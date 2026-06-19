import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Mark } from './Logo'

/**
 * SplashIntro — the brand "journey reveal" onboarding overlay (spec §14).
 *
 * A self-managing, fullscreen, decorative overlay that plays a short cinematic
 * brand reveal and then removes itself from the DOM. It is NON-BLOCKING: it
 * merely overlays the routed app (which mounts/loads underneath in parallel),
 * is time-boxed (never waits on a load event), and unmounts to `null` when done
 * so it can never freeze or trap interaction.
 *
 * Modes (decided ONCE on mount):
 *   - reduced  (prefers-reduced-motion) → static lit wordmark, quick fade (~300ms).
 *   - short    (sessionStorage flag set) → static lit wordmark, fade (~450ms).
 *   - full     (first visit this session) → traveler walks V→R illuminating each
 *              letter in its wake, route line extends, overlay fades into the app
 *              (~1.5s total). Sets `voyager-splash-seen`.
 *
 * a11y: decorative → `aria-hidden`; no roles, no focus trap. The real <h1> lives
 * on Landing and is unaffected.
 *
 * Lifecycle: all timers cleared on unmount; StrictMode-safe (no double timers /
 * leaks); `sessionStorage` access is feature-detected for SSR/jsdom.
 */

const WORD = 'VOYAGER'
const SPLASH_KEY = 'voyager-splash-seen'

type Mode = 'full' | 'short' | 'reduced'

/** Feature-detected sessionStorage read (SSR/jsdom safe). */
function hasSeenSplash(): boolean {
  try {
    return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(SPLASH_KEY) != null
  } catch {
    return false
  }
}

/** Feature-detected sessionStorage write (SSR/jsdom safe). */
function markSplashSeen(): void {
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(SPLASH_KEY, '1')
  } catch {
    /* storage unavailable (private mode / SSR) — non-fatal, splash just replays */
  }
}

/* ---- timing (ms) ---- */
const WALK_MS = 1100 // traveler crosses V → R
const FULL_HOLD_MS = 250 // small beat at the R before the fade begins
const FADE_MS = 420 // overlay opacity → 0
const FULL_TOTAL = WALK_MS + FULL_HOLD_MS + FADE_MS // ≈ 1.77s ceiling
const SHORT_HOLD_MS = 450
const REDUCED_HOLD_MS = 300
const SKIP_FADE_MS = 240 // quick fade when skipped

export default function SplashIntro() {
  const reduce = useReducedMotion()

  // Decide the mode exactly once, on first render. (Lazy initializer so the
  // sessionStorage read + reduced-motion check happen a single time.)
  const [mode] = useState<Mode>(() => {
    if (reduce) return 'reduced'
    if (hasSeenSplash()) return 'short'
    return 'full'
  })

  // `phase` drives what's rendered: 'play' (visible) → 'fade' (fading out) →
  // 'done' (unmounted). Skipping jumps straight to 'fade'.
  const [phase, setPhase] = useState<'play' | 'fade' | 'done'>('play')
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  // StrictMode double-invokes effects in dev; this guard ensures the schedule
  // (and the sessionStorage write) runs once per real mount.
  const started = useRef(false)

  const clearTimers = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }
  const after = (ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms))
  }

  // Jump to the end: quick fade, then unmount. Idempotent.
  const skip = useRef<() => void>(() => {})
  skip.current = () => {
    if (phase !== 'play') return
    clearTimers()
    setPhase('fade')
    after(SKIP_FADE_MS, () => setPhase('done'))
  }

  useEffect(() => {
    if (started.current) return
    started.current = true

    if (mode === 'full') markSplashSeen()

    const holdThenFade = (hold: number) => {
      after(hold, () => setPhase('fade'))
      after(hold + FADE_MS, () => setPhase('done'))
    }

    if (mode === 'full') {
      after(WALK_MS + FULL_HOLD_MS, () => setPhase('fade'))
      after(FULL_TOTAL, () => setPhase('done'))
    } else if (mode === 'short') {
      holdThenFade(SHORT_HOLD_MS)
    } else {
      holdThenFade(REDUCED_HOLD_MS)
    }

    return clearTimers
    // mode is stable for the component's life; intentional one-shot schedule.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // Escape skips to the end.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') skip.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (phase === 'done') return null

  const fading = phase === 'fade'
  const walking = mode === 'full' && phase === 'play'
  const letters = WORD.split('')

  // Per-letter illumination: in `full` mode each letter lights up as the traveler
  // crosses it, staggered across the walk. In short/reduced the word is already lit.
  const litFrom = (i: number) =>
    mode === 'full'
      ? 0.12 + (i / Math.max(1, letters.length - 1)) * (WALK_MS / 1000) * 0.9
      : 0

  return (
    <motion.div
      aria-hidden="true"
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-base"
      style={{ pointerEvents: fading ? 'none' : 'auto' }}
      initial={{ opacity: 1 }}
      animate={{ opacity: fading ? 0 : 1 }}
      transition={{ duration: (fading ? FADE_MS : 0) / 1000, ease: 'easeInOut' }}
      onClick={() => skip.current()}
    >
      {/* Wordmark + traveler rig. `relative` so the traveler/route line position
          against the wordmark. */}
      <div className="relative">
        <div
          className="font-serif font-medium text-ink select-none"
          style={{
            fontSize: 'clamp(2.25rem, 9vw, 5rem)',
            letterSpacing: '0.34em',
            // pad right so the trailing letter-spacing doesn't shove the word off-center
            paddingLeft: '0.34em',
          }}
        >
          {letters.map((ch, i) => (
            <motion.span
              key={i}
              className="inline-block"
              style={{ color: 'var(--ink)' }}
              initial={
                mode === 'full'
                  ? { opacity: 0.13, textShadow: '0 0 0px rgba(255,217,168,0)' }
                  : false
              }
              animate={
                mode === 'full'
                  ? {
                      opacity: 1,
                      textShadow: '0 0 18px rgba(255,217,168,0.35)',
                    }
                  : undefined
              }
              transition={
                mode === 'full'
                  ? { duration: 0.32, delay: litFrom(i), ease: 'easeOut' }
                  : undefined
              }
            >
              {ch}
            </motion.span>
          ))}
        </div>

        {/* Traveler + trail + route line — full mode only. */}
        {mode === 'full' && (
          <motion.div
            className="absolute top-1/2 left-0"
            style={{ translateY: '-150%' }}
            initial={{ x: '0%' }}
            animate={{ x: walking ? '100%' : '120%' }}
            transition={{ duration: walking ? WALK_MS / 1000 : 0.5, ease: 'easeInOut' }}
          >
            {/* light trail drawn behind the traveler */}
            <motion.span
              className="absolute top-1/2 right-full h-px"
              style={{
                width: '60vw',
                transformOrigin: 'right center',
                translateY: '-50%',
                background:
                  'linear-gradient(to left, rgba(255,217,168,0.55), rgba(255,217,168,0))',
              }}
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: 0.9 }}
              transition={{ duration: WALK_MS / 1000, ease: 'easeOut' }}
            />

            {/* the traveler itself, with a subtle walk bob */}
            <motion.span
              className="block text-sig-link"
              style={{ filter: 'drop-shadow(0 0 10px rgba(255,217,168,0.45))' }}
              animate={walking ? { y: [0, -3, 0, -3, 0] } : { y: 0 }}
              transition={
                walking
                  ? { duration: 0.5, repeat: Infinity, ease: 'easeInOut' }
                  : { duration: 0.2 }
              }
            >
              <Mark size={34} />
            </motion.span>

            {/* route line extending forward — draws in as the walk completes */}
            <motion.span
              className="absolute top-1/2 left-full h-px"
              style={{
                width: '40vw',
                transformOrigin: 'left center',
                translateY: '-50%',
                background:
                  'linear-gradient(to right, var(--sig-link), rgba(255,217,168,0.15) 70%, transparent)',
              }}
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: phase === 'play' ? 0 : 1, opacity: phase === 'play' ? 0 : 1 }}
              transition={{ duration: 0.45, ease: 'easeOut' }}
            />
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}
