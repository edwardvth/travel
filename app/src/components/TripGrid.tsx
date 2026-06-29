import { motion, useReducedMotion } from 'framer-motion'
import { spanClass, isFeature } from '../lib/bento'
import { TripTile } from './TripTile'
import { AddTripTile } from './AddTripTile'
import type { Trip } from '../types'

/**
 * The bento board of trip tiles, reused by both home states. A trailing "add"
 * cell is shown when `onAdd` is provided. Tiles fade up with a gentle stagger
 * on mount (collapsed under reduced motion).
 */
export function TripGrid({
  trips, onOpen, tripActions, onAdd, glass,
}: {
  trips: Trip[]
  onOpen: (id: string) => void
  tripActions?: (t: Trip) => React.ReactNode
  /** When provided, append a dashed "add a trip" cell as the last bento cell. */
  onAdd?: () => void
  /** Render tiles as glass so they read over the globe (launchpad). */
  glass?: boolean
}) {
  const reduce = useReducedMotion()
  const container = {
    hidden: { opacity: reduce ? 1 : 0 },
    show: { opacity: 1, transition: reduce ? { duration: 0.12 } : { staggerChildren: 0.045, delayChildren: 0.03 } },
  }
  const item = reduce
    ? { hidden: { opacity: 1 }, show: { opacity: 1 } }
    : { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.34, ease: 'easeOut' } } }

  const n = trips.length + (onAdd ? 1 : 0)

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="grid grid-cols-1 gap-4 auto-rows-[210px] sm:grid-cols-2 sm:auto-rows-[200px] lg:grid-cols-4 lg:auto-rows-[150px] lg:grid-flow-row-dense"
    >
      {trips.map((t, i) => (
        <motion.div key={t.id} variants={item} className={spanClass(i, n)}>
          <TripTile
            trip={t}
            onOpen={onOpen}
            actions={tripActions?.(t)}
            variant={isFeature(i, n) ? 'large' : 'small'}
            className="h-full"
            glass={glass}
          />
        </motion.div>
      ))}
      {onAdd && (
        <motion.div variants={item} className={spanClass(trips.length, n)}>
          <AddTripTile onClick={onAdd} label="Plan your next escape" sub="Add another trip" />
        </motion.div>
      )}
    </motion.div>
  )
}
