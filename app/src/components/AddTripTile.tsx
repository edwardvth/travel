import { Plus } from 'lucide-react'
import { cn } from '../lib/utils'

/**
 * The dashed "add a trip" cell. Sits inline in the board grid (filling whatever
 * height its grid cell gives it) or stands alone under the empty-state hero.
 * Quiet by default, warming to the claret signature on hover.
 */
export function AddTripTile({
  onClick, label, sub, className,
}: {
  onClick: () => void
  label: string
  sub: string
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group grid h-full w-full place-items-center rounded-card border border-dashed border-hair-strong text-center',
        'transition-colors hover:border-sig-link/60 hover:bg-fill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link',
        className,
      )}
    >
      <span className="flex flex-col items-center gap-3 px-6 py-8">
        <span className="grid h-12 w-12 place-items-center rounded-full border border-sig-link/50 text-sig-link transition-colors group-hover:border-sig-btn group-hover:bg-sig-btn group-hover:text-white">
          <Plus size={20} strokeWidth={2} />
        </span>
        <span className="font-serif text-xl text-ink">{label}</span>
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">{sub}</span>
      </span>
    </button>
  )
}
