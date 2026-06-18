import { useEffect } from 'react'
import { cn } from '../../lib/utils'
export function Sheet({ open, onClose, children, labelledBy }:
  { open: boolean; onClose: () => void; children: React.ReactNode; labelledBy?: string }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
      role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className={cn('relative w-full md:max-w-lg bg-overlay border border-hair',
        'rounded-t-card md:rounded-card p-6 shadow-lift', 'max-h-[90vh] overflow-y-auto')}>
        {children}
      </div>
    </div>
  )
}
