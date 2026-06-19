import { useEffect, useMemo, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { HERO_DESTINATIONS } from '../data/heroDestinations'
import { cn } from '../lib/utils'

/**
 * HeroMicroDetails — a single, quiet rotating info line under the search pill.
 *
 * Ambient chrome: it sets a tasteful, premium tone WITHOUT fabricating any
 * engagement metrics. Every line is truthful, qualitative Voyager-voice copy.
 * One of them ("Currently featuring …") names a few REAL destinations pulled
 * from `HERO_DESTINATIONS` and rotates the trio so the hero feels alive.
 *
 * Motion: lines cross-fade on a slow (~4s) interval. Under reduced-motion it is
 * static — one line, no fade, no interval. It's decorative (`aria-hidden`): the
 * headline + pill already carry the meaningful content, so this stays
 * unobtrusive and is not announced.
 */

const ROTATE_MS = 4200
const FADE_MS = 600

export interface HeroMicroDetailsProps {
  /** The currently-typed destination (unused for copy today; reserved for future tie-in). */
  activeTerm?: string
  className?: string
}

/** Rotate the featured trio across the manifest so it varies between visits. */
function featuredTrio(seed: number): string {
  const list = HERO_DESTINATIONS
  if (list.length === 0) return ''
  const start = seed % list.length
  const picks: string[] = []
  for (let i = 0; i < Math.min(3, list.length); i++) {
    picks.push(list[(start + i) % list.length])
  }
  return picks.join(' · ')
}

function buildLines(seed: number): string[] {
  return [
    'Hand-picked destinations',
    `Currently featuring: ${featuredTrio(seed)}`,
    'Seasonal travel inspiration',
    'Personalized day-by-day planning',
  ]
}

export function HeroMicroDetails({ activeTerm: _activeTerm, className }: HeroMicroDetailsProps) {
  const reduce = useReducedMotion() ?? false

  // A per-mount seed so the featured trio varies between page loads without
  // any fabricated counts. Stable for the lifetime of the component.
  const lines = useMemo(() => buildLines(Math.floor(Math.random() * HERO_DESTINATIONS.length)), [])

  const [index, setIndex] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (reduce) return
    if (lines.length <= 1) return

    let fadeOutTimer: ReturnType<typeof setTimeout> | undefined
    const cycle = setInterval(() => {
      // Fade out, swap, fade back in.
      setVisible(false)
      fadeOutTimer = setTimeout(() => {
        setIndex((i) => (i + 1) % lines.length)
        setVisible(true)
      }, FADE_MS)
    }, ROTATE_MS)

    return () => {
      clearInterval(cycle)
      if (fadeOutTimer) clearTimeout(fadeOutTimer)
    }
  }, [reduce, lines.length])

  const text = lines[index] ?? lines[0] ?? ''

  return (
    <p
      data-testid="hero-micro-details"
      aria-hidden="true"
      className={cn(
        'mx-auto mt-4 max-w-xl truncate text-center font-sans text-[13px] tracking-wide text-white/65',
        className,
      )}
      style={{
        opacity: reduce ? 1 : visible ? 1 : 0,
        transition: reduce ? undefined : `opacity ${FADE_MS}ms ease`,
        willChange: reduce ? undefined : 'opacity',
      }}
    >
      {text}
    </p>
  )
}

export default HeroMicroDetails
