import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'

/**
 * Rotating, lightly tongue-in-cheek copy shown ONLY inside the description body
 * while a stop's story is still generating. Kept dry and premium — never childish.
 */
export const DESCRIPTION_LOADING_MESSAGES = [
  'Combobulating the description…',
  'Asking a very well-traveled pigeon…',
  'Walking there really quick…',
  'Bribing the travel gods…',
  'Consulting the tiny tour guide in our server…',
  'Dusting off the local secrets…',
  'Finding the good part…',
  'Reading the plaque so you don’t have to…',
  'Pretending we’ve been there before…',
  'Packing the description into a carry-on…',
  'Calling someone who knows a guy…',
  'Traveling to the end of the world for info…',
  'Unfolding the world’s smallest map…',
  'Checking if this place is actually as cool as it looks…',
  'Waiting for the postcard to arrive…',
  'Translating vibes into words…',
  'Doing a quick lap around the block…',
  'Interrogating a suspiciously knowledgeable landmark…',
  'Gathering local lore…',
  'Making the description sound less like a brochure…',
]

/** How long each phrase shows before rotating. */
const ROTATE_MS = 2800

/** Three dots — jumping while loading, a gentle pulse under reduced motion. */
function Dots({ reduce }: { reduce: boolean }) {
  const anim = reduce ? { opacity: [0.35, 1, 0.35] } : { y: [0, -4, 0] }
  const dur = reduce ? 1.4 : 0.9
  return (
    <span className={'inline-flex ' + (reduce ? 'items-center' : 'items-end') + ' gap-1'} aria-hidden="true">
      {[0, 1, 2].map(i => (
        <motion.span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-sig-link"
          animate={anim}
          transition={{ duration: dur, repeat: Infinity, delay: i * (reduce ? 0.18 : 0.12), ease: 'easeInOut' }}
        />
      ))}
    </span>
  )
}

/**
 * The in-body "description is loading" state for Guide cards: a small jumping-dot
 * indicator + rotating funny copy — shown ONLY inside the description area, never
 * as a full-card spinner, so the card never looks broken. Respects reduced motion
 * (dots pulse rather than bounce; copy cross-fades gently instead of sliding).
 */
export function DescriptionLoading() {
  const reduce = useReducedMotion() ?? false
  const [i, setI] = useState(() => Math.floor(Math.random() * DESCRIPTION_LOADING_MESSAGES.length))
  useEffect(() => {
    const id = window.setInterval(
      () => setI(n => (n + 1) % DESCRIPTION_LOADING_MESSAGES.length),
      ROTATE_MS,
    )
    return () => window.clearInterval(id)
  }, [])

  return (
    <div className="flex items-center gap-2.5 py-1.5 text-muted">
      <Dots reduce={reduce} />
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={i}
          aria-hidden="true"
          className="text-[13.5px] italic"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -3 }}
          transition={{ duration: 0.25 }}
        >
          {DESCRIPTION_LOADING_MESSAGES[i]}
        </motion.span>
      </AnimatePresence>
      {/* One stable, non-spammy announcement (the rotating copy is decorative). */}
      <span className="sr-only" role="status">Loading description…</span>
    </div>
  )
}

export default DescriptionLoading
