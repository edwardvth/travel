import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { onHeroReady } from '../hero/heroReady'
import { Mark } from './Logo'

/**
 * SplashIntro — minimal brand reveal (spec §14).
 *
 * A small, quiet brand moment: a centered traveler `Mark` above a compact
 * VOYAGER wordmark on a near-black canvas. It is NON-BLOCKING — it overlays the
 * routed app (which mounts/loads in parallel beneath it) and removes itself the
 * instant the hero background is actually live.
 *
 * Auto-dismiss fires at the EARLIEST of:
 *   - the hero background being ready (its `<video>` starts playing, or the
 *     poster-only hero signals via `onHeroReady`), OR
 *   - a hard safety cap (~2500ms),
 * but NEVER before a minimum-visible floor (~350ms) so the moment registers. If
 * hero-ready fires sooner than the floor, we wait out the remainder, then
 * dismiss. Dismiss = a fast fade-out (~200ms) then the overlay unmounts
 * (returns null). It can never hang: the safety cap guarantees it clears.
 *
 * Motion: a quick subtle fade + slight scale-in (~200ms). Reduced-motion →
 * appears instantly, no movement.
 *
 * a11y/lifecycle: decorative → `aria-hidden`; no roles, no focus trap. Click or
 * Escape skips immediately. All timers + the `onHeroReady` subscription are
 * cleaned up on unmount. StrictMode-safe: timers/subscriptions are scheduled IN
 * the effect and cleared in cleanup, so StrictMode's re-run leaves exactly one
 * active schedule (no persistent run-once guard that would swallow the dismiss).
 * `window`/`document` are feature-detected for SSR/jsdom.
 */

const WORD = 'PASSAGE'

/* ---- timing (ms) ---- */
const MIN_VISIBLE_MS = 350 // floor so the moment registers before dismiss
const SAFETY_CAP_MS = 2500 // ceiling — dismiss even if hero-ready never fires
const FADE_MS = 200 // overlay opacity → 0

export default function SplashIntro() {
  const reduce = useReducedMotion()

  // `phase` drives what's rendered: 'show' (visible) → 'fade' (fading out) →
  // 'done' (unmounted). Hero-ready / cap / skip all converge on the same
  // fade → done.
  const [phase, setPhase] = useState<'show' | 'fade' | 'done'>('show')
  const mounted = useRef(true)
  const skipRef = useRef<() => void>(() => {})

  useEffect(() => {
    mounted.current = true
    const timers: ReturnType<typeof setTimeout>[] = []
    const push = (id: ReturnType<typeof setTimeout>) => timers.push(id)

    // Begin the fade-then-unmount, idempotently.
    const dismiss = () => {
      if (!mounted.current) return
      setPhase((p) => (p === 'show' ? 'fade' : p))
      push(setTimeout(() => mounted.current && setPhase('done'), FADE_MS))
    }
    skipRef.current = dismiss

    // Dismiss at the EARLIEST of hero-ready or the safety cap — but never
    // before the min-visible floor. `heroReady` flips true when the hero
    // signals; `minElapsed` flips true once the floor passes. Whichever
    // completes the pair last triggers the dismiss.
    let heroReady = false
    let minElapsed = false

    const maybeDismiss = () => {
      if (heroReady && minElapsed) dismiss()
    }

    push(
      setTimeout(() => {
        minElapsed = true
        maybeDismiss()
      }, MIN_VISIBLE_MS),
    )

    const unsubscribe = onHeroReady(() => {
      heroReady = true
      maybeDismiss()
    })

    // Hard safety cap — always dismisses, regardless of hero-ready.
    push(setTimeout(dismiss, SAFETY_CAP_MS))

    // Click / Escape skip straight to the fade.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss()
    }
    if (typeof window !== 'undefined') window.addEventListener('keydown', onKey)

    return () => {
      mounted.current = false
      timers.forEach(clearTimeout)
      unsubscribe()
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
