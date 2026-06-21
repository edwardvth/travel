import { useEffect, useState } from 'react'
import { ChevronRight, X } from 'lucide-react'

/**
 * The soft "arriving" banner from the spec/reference: a small, non-blocking
 * slide-in — "You're arriving at {name} · View Guide →" — that the traveler can
 * tap to open the Arrival state now, or dismiss. It deliberately does NOT hijack
 * the screen (the user may be crossing a street or taking a photo).
 *
 * LOCKED: the ~5s auto-open timer lives in the orchestrator (Task 18), NOT here —
 * this component only renders + reports taps. Pure presentation.
 */
export function ArrivingBanner({
  name,
  onOpen,
  onDismiss,
}: {
  name: string
  onOpen: () => void
  onDismiss: () => void
}) {
  // Mount → slide in (transform/opacity only; honors reduced-motion globally).
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [])

  return (
    <div
      role="status"
      aria-live="polite"
      className={
        'flex items-center gap-3 rounded-[14px] bg-overlay border border-sig-btn/40 shadow-lift px-3.5 py-3 transition-all duration-300 ease-out ' +
        (shown ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2')
      }
    >
      <span
        className="flex-none w-2 h-2 rounded-full bg-sig-link"
        style={{ animation: 'vyPulse 1.4s ease-in-out infinite' }}
        aria-hidden="true"
      />
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 flex-1 flex items-center gap-1.5 text-left min-h-[44px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link rounded-md -mx-1 px-1"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] text-ink">
            You're arriving at <span className="font-semibold">{name}</span>
          </span>
          <span className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-sig-link">
            View Guide <ChevronRight size={13} aria-hidden="true" />
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss arrival notice"
        className="flex-none grid place-items-center w-11 h-11 -mr-1 rounded-md text-muted hover:text-ink hover:bg-fill transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  )
}

export default ArrivingBanner
