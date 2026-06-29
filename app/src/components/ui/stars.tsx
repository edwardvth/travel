import * as React from 'react'
import { motion, type SpringOptions } from 'framer-motion'

import { cn } from '../../lib/utils'

/**
 * Animated starfield background. Same public API as the original `StarsBackground`
 * (drop-in), but the stars are rendered as REPEATING radial-gradient tiles rather
 * than a giant `box-shadow` string — the box-shadow approach didn't paint reliably
 * when used as a masked, negatively-stacked background layer. Each layer is a tile
 * of random dots that repeats across the page (even, dense coverage) and drifts
 * upward via `background-position` (seamless: it travels exactly one tile).
 */

/** Build a comma-separated list of radial-gradient dots within a `tile`×`tile` cell. */
function starTile(count: number, tile: number, size: number, color: string): string {
  const dots: string[] = []
  for (let i = 0; i < count; i++) {
    const x = Math.floor(Math.random() * tile)
    const y = Math.floor(Math.random() * tile)
    dots.push(`radial-gradient(${size}px ${size}px at ${x}px ${y}px, ${color}, transparent)`)
  }
  return dots.join(', ')
}

function StarLayer({
  count, tile, size, color, durationS,
}: { count: number; tile: number; size: number; color: string; durationS: number }) {
  const [bg, setBg] = React.useState('')
  React.useEffect(() => { setBg(starTile(count, tile, size, color)) }, [count, tile, size, color])
  return (
    <motion.div
      data-slot="star-layer"
      aria-hidden
      className="absolute inset-0"
      style={{ backgroundImage: bg, backgroundSize: `${tile}px ${tile}px`, backgroundRepeat: 'repeat' }}
      animate={{ backgroundPositionY: ['0px', `-${tile}px`] }}
      transition={{ repeat: Infinity, duration: durationS, ease: 'linear' }}
    />
  )
}

type StarsBackgroundProps = React.ComponentProps<'div'> & {
  /** Retained for API compatibility (parallax is disabled for the background use). */
  factor?: number
  /** Base loop duration (seconds) for the densest layer; back layers are slower. */
  speed?: number
  transition?: SpringOptions
  starColor?: string
  pointerParallax?: boolean
}

export function StarsBackground({
  children,
  className,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  factor,
  speed = 50,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  transition,
  starColor = '#ffffff',
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  pointerParallax,
  ...props
}: StarsBackgroundProps) {
  return (
    <div data-slot="stars-background" className={cn('relative overflow-hidden', className)} {...props}>
      {/* Three parallax-feeling layers: small/dense + medium + large/sparse, each
          drifting upward at a different speed. */}
      <StarLayer count={50} tile={320} size={1.4} color={starColor} durationS={speed} />
      <StarLayer count={26} tile={440} size={2} color={starColor} durationS={speed * 1.7} />
      <StarLayer count={14} tile={600} size={2.6} color={starColor} durationS={speed * 2.6} />
      {children}
    </div>
  )
}

export default StarsBackground
