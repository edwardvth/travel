import { cn } from '../lib/utils'

/**
 * StaticBackdrop — the launchpad's calm fallback backdrop (Phase 1): a deep
 * claret→ink radial gradient with a faint, masked map-grid texture. Rendered as
 * an absolutely-positioned layer so it can sit behind hero content and beneath
 * the Phase 2 FieldGlobe shader. This is the single source of truth for the
 * fallback shown on every no-WebGL / reduced-motion / pre-first-frame path.
 */
export function StaticBackdrop({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('absolute inset-0', className)}
      style={{
        background:
          'radial-gradient(120% 85% at 50% -5%, rgba(58,34,48,0.55) 0%, rgba(21,13,18,0.55) 48%, #07070b 100%)',
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.04) 1px, transparent 1px)',
          backgroundSize: '34px 34px',
          maskImage: 'radial-gradient(70% 60% at 50% 30%, #000, transparent 75%)',
        }}
      />
    </div>
  )
}
