import { useEffect, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { cn } from '../lib/utils'

/**
 * HeroMicroDetails — a single, quiet rotating info line under the search pill.
 *
 * Ambient chrome: it sets a tasteful, premium tone WITHOUT fabricating any
 * engagement metrics. Every line is truthful, qualitative Voyager-voice copy.
 *
 * Motion: lines cross-fade on a slow (~4s) interval. Under reduced-motion it is
 * static — one line, no fade, no interval. It's decorative (`aria-hidden`): the
 * headline + pill already carry the meaningful content, so this stays
 * unobtrusive and is not announced.
 */

const ROTATE_MS = 4200
const FADE_MS = 600

const LINES = [
  'Hand-picked destinations',
  'Seasonal travel inspiration',
  'Personalized day-by-day planning',
]

export interface HeroMicroDetailsProps {
  className?: string
}

export function HeroMicroDetails({ className }: HeroMicroDetailsProps) {
  const reduce = useReducedMotion() ?? false
  const [index, setIndex] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (reduce) return

    let fadeOutTimer: ReturnType<typeof setTimeout> | undefined
    const cycle = setInterval(() => {
      // Fade out, swap, fade back in.
      setVisible(false)
      fadeOutTimer = setTimeout(() => {
        setIndex((i) => (i + 1) % LINES.length)
        setVisible(true)
      }, FADE_MS)
    }, ROTATE_MS)

    return () => {
      clearInterval(cycle)
      if (fadeOutTimer) clearTimeout(fadeOutTimer)
    }
  }, [reduce])

  const text = LINES[index] ?? LINES[0]

  return (
    <p
      data-testid="hero-micro-details"
      aria-hidden="true"
      className={cn(
        'mx-auto max-w-xl truncate text-center font-sans text-[13px] tracking-wide text-white/60',
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
