import { useEffect, useState } from 'react'
import { cn } from '../lib/utils'

export interface SyncIndicatorProps {
  saving: boolean
  lastSavedAt: string | null
  saveError: Error | null
  /** Hide entirely for view-only trips (nothing to sync). */
  canEdit?: boolean
  className?: string
}

/**
 * Quiet planner sync status: "Saving…", a briefly-shown "Saved" with a check
 * that fades, or a persistent retry/error state. Reads the autosave state lifted
 * into PlannerLayout. aria-live polite so screen readers hear status changes
 * without being interrupted. Reduced-motion is handled globally in index.css.
 */
export function SyncIndicator({ saving, lastSavedAt, saveError, canEdit = true, className }: SyncIndicatorProps) {
  // Show a transient "Saved" confirmation when a save completes, then fade it.
  const [showSaved, setShowSaved] = useState(false)

  useEffect(() => {
    if (saving || saveError || !lastSavedAt) return
    setShowSaved(true)
    const t = setTimeout(() => setShowSaved(false), 2400)
    return () => clearTimeout(t)
  }, [lastSavedAt, saving, saveError])

  if (!canEdit) return null

  let state: 'saving' | 'error' | 'saved' | 'idle' = 'idle'
  if (saving) state = 'saving'
  else if (saveError) state = 'error'
  else if (showSaved) state = 'saved'

  const base = 'inline-flex items-center gap-1.5 text-[12px] font-bold select-none transition-opacity duration-300'

  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(base, state === 'idle' ? 'opacity-0' : 'opacity-100', className)}
    >
      {state === 'saving' && (
        <>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true" className="animate-spin text-muted">
            <path d="M12 3a9 9 0 1 0 9 9" />
          </svg>
          <span className="text-muted">Saving…</span>
        </>
      )}

      {state === 'saved' && (
        <>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-muted">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          <span className="text-muted">Saved</span>
        </>
      )}

      {state === 'error' && (
        <span className="text-sig">Couldn’t save — retrying</span>
      )}

      {/* idle keeps the element present (opacity 0) so layout doesn't jump. */}
      {state === 'idle' && <span aria-hidden="true">&nbsp;</span>}
    </span>
  )
}
