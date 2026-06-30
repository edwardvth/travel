import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, MotionConfig } from 'framer-motion'
import { cn } from '../../lib/utils'

/** Selector for the tabbable elements we cycle focus through inside the panel. */
const FOCUSABLE =
  'a[href],area[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

export function Sheet({ open, onClose, children, labelledBy }:
  { open: boolean; onClose: () => void; children: React.ReactNode; labelledBy?: string }) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Esc to close + a focus trap with focus restore. Open caches the previously
  // focused element and moves focus into the panel; Tab/Shift+Tab cycle within
  // the panel; unmount/close restores focus to wherever it was before.
  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    const previouslyFocused = document.activeElement as HTMLElement | null

    const focusable = () =>
      Array.from(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
        .filter(el => el.offsetParent !== null || el === document.activeElement)

    // Move focus to the first focusable element, or the panel itself.
    const first = focusable()[0]
    if (first) first.focus()
    else panel?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const items = focusable()
      if (items.length === 0) {
        // Nothing tabbable → keep focus on the panel.
        e.preventDefault()
        panel?.focus()
        return
      }
      const firstEl = items[0]
      const lastEl = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey) {
        if (active === firstEl || !panel?.contains(active)) {
          e.preventDefault()
          lastEl.focus()
        }
      } else {
        if (active === lastEl || !panel?.contains(active)) {
          e.preventDefault()
          firstEl.focus()
        }
      }
    }

    // Lock background scroll while the sheet is open (it's a true modal overlay).
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      previouslyFocused?.focus?.()
    }
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null
  // Portal to <body> so the overlay escapes any ancestor transform/stacking
  // context (the cinematic home uses framer-motion transforms that would
  // otherwise trap a nested fixed element below the hero). z above the pill
  // calendar (z-60) and home layers.
  return createPortal(
    <MotionConfig reducedMotion="user">
      <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center"
        role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        <motion.div
          className="absolute inset-0 bg-black/60"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
        />
        <motion.div
          ref={panelRef}
          tabIndex={-1}
          className={cn('relative w-full md:max-w-lg bg-overlay border border-hair',
            'rounded-t-card md:rounded-card p-6 shadow-lift', 'max-h-[90vh] overflow-y-auto',
            'focus-visible:outline-none')}
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 340, damping: 30 }}
        >
          {children}
        </motion.div>
      </div>
    </MotionConfig>,
    document.body,
  )
}
