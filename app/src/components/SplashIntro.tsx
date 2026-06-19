import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Mark } from './Logo'

/**
 * SplashIntro — minimal brand reveal (spec §14).
 *
 * A small, quiet brand moment: a centered traveler `Mark` above a compact
 * VOYAGER wordmark on a near-black canvas. It is NON-BLOCKING — it overlays the
 * routed app (which mounts/loads in parallel beneath it) and removes itself the
 * instant content is ready.
 *
 * Auto-dismiss fires at the EARLIEST of:
 *   - the page being ready (`document.readyState === 'complete'`, or the window
 *     `load` event), but never before a minimum visible time (~350ms), OR
 *   - a hard cap (~800ms).
 * Then a fast fade-out (~200ms) and the overlay unmounts (returns null). It can
 * never hang: window load + the cap guarantee it clears (≤ ~1s total).
 *
 * Motion: a quick subtle fade + slight scale-in (~200ms). Reduced-motion →
 * appears instantly, no movement.
 *
 * a11y/lifecycle: decorative → `aria-hidden`; no roles, no focus trap. Click or
 * Escape skips immediately. All timers + the `load` listener are cleaned up on
 * unmount; StrictMode-safe (single schedule, no double timers); `window`/
 * `document` are feature-detected for SSR/jsdom.
 */

const WORD = 'VOYAGER'

/* ---- timing (ms) ---- */
const MIN_VISIBLE_MS = 350 // floor so the moment registers before ready-dismiss
const HARD_CAP_MS = 800 // ceiling — dismiss even if "load" never fires
const FADE_MS = 200 // overlay opacity → 0

/** Feature-detected page-ready check (SSR/jsdom safe). */
function isPageReady(): boolean {
  return typeof document !== 'undefined' && document.readyState === 'complete'
}

export default function SplashIntro() {
  const reduce = useReducedMotion()

  // `phase` drives what's rendered: 'show' (visible) → 'fade' (fading out) →
  // 'done' (unmounted). Skip/ready/cap all converge on the same fade → done.
  const [phase, setPhase] = useState<'show' | 'fade' | 'done'>('show')
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  // StrictMode double-invokes effects in dev; this guard ensures the schedule
  // runs once per real mount (no double timers / leaks).
  const started = useRef(false)
  const mounted = useRef(true)
  const skipRef = useRef<() => void>(() => {})

  useEffect(() => {
    mounted.current = true
    if (started.current) return
    started.current = true

    const list = timers.current
    const push = (id: ReturnType<typeof setTimeout>) => list.push(id)

    // Begin the fade-then-unmount, idempotently.
    const dismiss = () => {
      if (!mounted.current) return
      setPhase((p) => (p === 'show' ? 'fade' : p))
      push(setTimeout(() => mounted.current && setPhase('done'), FADE_MS))
    }

    // The earliest legal ready-dismiss is gated behind MIN_VISIBLE_MS so the
    // moment registers. `readyAt` flips true once load/complete is observed;
    // `minElapsed` flips true once the floor passes. Whichever completes the
    // pair last triggers the dismiss.
    let readyAt = isPageReady()
    let minElapsed = false

    const maybeReadyDismiss = () => {
      if (readyAt && minElapsed) dismiss()
    }

    const onReady = () => {
      if (readyAt) return
      readyAt = true
      maybeReadyDismiss()
    }

    push(
      setTimeout(() => {
        minElapsed = true
        maybeReadyDismiss()
      }, MIN_VISIBLE_MS),
    )

    // Only listen for `load` if the page isn't already complete.
    let onLoad: (() => void) | null = null
    if (!readyAt && typeof window !== 'undefined') {
      onLoad = () => onReady()
      window.addEventListener('load', onLoad, { once: true })
    }

    // Hard cap — always dismisses, regardless of load.
    push(setTimeout(dismiss, HARD_CAP_MS))

    return () => {
      mounted.current = false
      list.forEach(clearTimeout)
      list.length = 0
      if (typeof window !== 'undefined' && onLoad) window.removeEventListener('load', onLoad)
    }
  }, [])

  // Click / Escape skip straight to the fade.
  useEffect(() => {
    const skip = () => {
      if (!mounted.current) return
      setPhase((p) => (p === 'show' ? 'fade' : p))
      timers.current.push(setTimeout(() => mounted.current && setPhase('done'), FADE_MS))
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') skip()
    }
    if (typeof window !== 'undefined') window.addEventListener('keydown', onKey)
    skipRef.current = skip
    return () => {
      if (typeof window !== 'undefined') window.removeEventListener('keydown', onKey)
    }
  }, [])

  if (phase === 'done') return null

  const fading = phase === 'fade'

  return (
    <motion.div
      aria-hidden="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-base"
      style={{ pointerEvents: fading ? 'none' : 'auto' }}
      initial={{ opacity: 1 }}
      animate={{ opacity: fading ? 0 : 1 }}
      transition={{ duration: FADE_MS / 1000, ease: 'easeInOut' }}
      onClick={() => skipRef.current()}
    >
      <motion.div
        className="flex flex-col items-center gap-3 select-none"
        initial={reduce ? false : { opacity: 0, scale: 0.96 }}
        animate={reduce ? undefined : { opacity: 1, scale: 1 }}
        transition={reduce ? undefined : { duration: 0.2, ease: 'easeOut' }}
      >
        <span className="text-sig-link">
          <Mark size={40} />
        </span>
        <span
          className="font-serif text-ink/85"
          style={{ fontSize: '18px', letterSpacing: '0.3em', paddingLeft: '0.3em' }}
        >
          {WORD}
        </span>
      </motion.div>
    </motion.div>
  )
}
