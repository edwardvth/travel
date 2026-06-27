import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { materialize, type SeedPayload, type MaterializeStatus } from './materialize-controller'

/**
 * Renders the flying seed card above everything during materialization. Mounted
 * once at the app root (the home). Subscribes to the controller so it keeps
 * rendering across the route swap. Falls back to a plain dissolve under reduced
 * motion or if `arrive`/`fail` never comes within a window. The animation is
 * cosmetic — trip creation + navigation happen regardless.
 */
export function MaterializeOverlay() {
  const reduce = useReducedMotion()
  const [, force] = useState(0)
  useEffect(() => materialize.subscribe(() => force(n => n + 1)), [])

  const status: MaterializeStatus = materialize.status
  const payload = materialize.payload
  const active = status === 'flying' || status === 'arrived'

  // Safety: if nothing hands off within 1.2s, dissolve out so we never get stuck.
  useEffect(() => {
    if (status !== 'flying') return
    const t = setTimeout(() => materialize.fail(), 1200)
    return () => clearTimeout(t)
  }, [status])

  // Clear shortly after arrival/failure so the seed fades, then unmounts.
  useEffect(() => {
    if (status === 'arrived' || status === 'failed') {
      const t = setTimeout(() => materialize.reset(), reduce ? 180 : 420)
      return () => clearTimeout(t)
    }
  }, [status, reduce])

  if (!active || !payload) return null

  const from = payload.sourceRect
  const start = from
    ? { top: from.top, left: from.left, width: from.width, x: 0, y: 0, scale: 1, borderRadius: 999 }
    : { top: '40%', left: '50%', width: 236, x: '-50%', y: 0, scale: 1, borderRadius: 16 }

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[100]">
      <AnimatePresence>
        {status === 'flying' && (
          <motion.div
            key="seed"
            initial={start}
            animate={reduce
              ? { opacity: [1, 0], transition: { duration: 0.22 } }
              : { top: 96, left: '50%', x: '-50%', width: 236, scale: [1, 0.86, 0.42], borderRadius: 16,
                  transition: { duration: 0.9, ease: [0.32, 0.04, 0.18, 1] } }}
            className="absolute overflow-hidden border border-white/20 shadow-[0_26px_70px_rgba(0,0,0,.6)]"
          >
            <SeedFace payload={payload} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body,
  )
}

function SeedFace({ payload }: { payload: SeedPayload }) {
  return (
    <div className="flex flex-col">
      <div className="relative h-[118px] bg-[linear-gradient(135deg,#3a2a30,#7d2230_70%,#a13546)]">
        {payload.coverUrl && (
          <img src={payload.coverUrl} alt="" className="absolute inset-0 size-full object-cover" />
        )}
        <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,.5),transparent_60%)]" />
      </div>
      <div className="bg-[rgba(14,12,18,.97)] px-3.5 py-2.5">
        <div className="font-serif text-[19px] text-white">{payload.destination.split(',')[0]}</div>
        <div className="font-mono text-[10.5px] text-gold mt-0.5">{payload.rangeLabel}</div>
      </div>
    </div>
  )
}

export default MaterializeOverlay
