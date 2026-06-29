import { useState } from 'react'
import { cn } from '../lib/utils'
import { formatDateRange } from '../lib/trip-helpers'
import { tripGradient } from '../lib/trip-tile'
import type { Trip } from '../types'
import { useTripCover } from './useTripCover'

type Variant = 'hero' | 'large' | 'small'

/**
 * A photographic trip card — the single building block of the home board, used
 * at three sizes. A real destination photo sits over a deterministic gradient
 * (so a missing/late image is never a grey gap); a bottom scrim keeps the white
 * serif title legible on any cover. `hero` is the full-width "next trip" banner;
 * `large` is the bento feature cell (shows stop count); `small` is a grid cell.
 */
export function TripTile({
  trip, onOpen, actions, variant, eyebrow, className, alwaysShowActions, glass,
}: {
  trip: Trip
  onOpen: (id: string) => void
  actions?: React.ReactNode
  variant: Variant
  eyebrow?: string
  className?: string
  /** Reveal actions without hover (touch / single-column mobile). */
  alwaysShowActions?: boolean
  /** Render the card surface as glass so it reads over the globe (launchpad). */
  glass?: boolean
}) {
  const { url, loading } = useTripCover(trip)
  const [failed, setFailed] = useState(false)
  const cover = !failed ? url : null

  const stops = trip.data?.days?.reduce((n, d) => n + (d.stops?.length || 0), 0) ?? 0
  const seed = trip.config?.destination || trip.config?.title || trip.title || trip.id
  const isHero = variant === 'hero'
  const showStops = variant !== 'small' && stops > 0
  const meta =
    `${formatDateRange(trip)}` +
    (showStops ? ` · ${stops} stop${stops === 1 ? '' : 's'}` : '') +
    (trip._shared ? ` · shared by ${trip._ownerEmail ?? 'owner'}` : '')

  const titleClass = isHero
    ? 'text-[clamp(44px,7vw,68px)] leading-[0.92]'
    : variant === 'large'
      ? 'text-[clamp(26px,3vw,38px)] leading-[0.98]'
      : 'text-[21px] leading-tight'

  return (
    <div
      className={cn(
        'group relative w-full overflow-hidden rounded-card border',
        glass ? 'border-white/15 bg-white/[0.06] backdrop-blur-xl' : 'border-hair',
        className,
      )}
      style={glass ? undefined : { background: tripGradient(seed) }}
    >
      {/* Destination photo — fades over the gradient; never leaves a gap. */}
      {cover && (
        <img
          src={cover}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
        />
      )}
      {loading && <span className="absolute inset-0 animate-pulse bg-white/[0.04]" />}

      {/* Legibility scrim — dark at the foot, clear up top. */}
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.06] to-transparent" />

      {/* Whole-tile open target, beneath the title + actions. */}
      <button onClick={() => onOpen(trip.id)} className="absolute inset-0 z-0" aria-label={`Open ${trip.title}`} />

      {eyebrow && (
        <div className="pointer-events-none absolute left-5 top-5 z-10 flex items-center gap-2.5 [text-shadow:0_2px_8px_rgba(0,0,0,0.85)]">
          <span className="h-px w-7 bg-gold/80" />
          <span className="font-mono text-[14px] uppercase tracking-[0.2em] text-gold">{eyebrow}</span>
        </div>
      )}

      {/* Sleek shadow on all text keeps the title + meta legible over very bright
          covers (text-shadow inherits to children). */}
      <div className={cn('pointer-events-none absolute left-5 right-5 z-10 [text-shadow:0_2px_8px_rgba(0,0,0,0.85)]', isHero ? 'bottom-6' : 'bottom-4')}>
        <h3 className={cn('font-serif font-medium tracking-tight text-white', titleClass)}>
          {trip.title}
        </h3>
        <p className="mt-2 font-mono text-[11px] uppercase tracking-wider text-white/75">{meta}</p>
      </div>

      {actions && (
        <div
          className={cn(
            'absolute right-3 top-3 z-20 flex gap-1.5 transition-opacity duration-200',
            alwaysShowActions
              ? 'opacity-100'
              : 'opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100',
          )}
        >
          {actions}
        </div>
      )}
    </div>
  )
}
