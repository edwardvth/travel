import { useEffect } from 'react'
import { Link, NavLink, Outlet, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { useTrip } from './useTrip'
import { useSaveTrip, type SavePartial } from './useSaveTrip'
import { TripHeader } from './TripHeader'
import { Skeleton } from '../components/ui/Skeleton'
import { Button } from '../components/ui/Button'
import { cn } from '../lib/utils'
import type { Trip } from '../types'

export interface PlannerOutletContext {
  trip: Trip
  canEdit: boolean
  /** Debounced, edit-gated autosave — single instance lifted to the layout. */
  save: (partial: SavePartial) => void
  saving: boolean
  lastSavedAt: string | null
  saveError: Error | null
}

interface NavItem {
  to: string
  label: string
  end?: boolean
  icon: React.ReactNode
}

function navItems(id: string): NavItem[] {
  return [
    {
      to: `/trip/${id}`,
      label: 'Itinerary',
      end: true,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
        </svg>
      ),
    },
    {
      to: `/trip/${id}/map`,
      label: 'Map',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 3 3 5.5v15L9 18l6 3 6-2.5v-15L15 6 9 3z" /><path d="M9 3v15M15 6v15" />
        </svg>
      ),
    },
    {
      to: `/trip/${id}/settings`,
      label: 'Settings',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
        </svg>
      ),
    },
  ]
}

function HeaderSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 md:px-8 py-3 border-b border-hair">
      <Skeleton className="w-9 h-9 rounded-btn" />
      <div className="flex-1">
        <Skeleton className="h-5 w-44 rounded-md" />
        <Skeleton className="h-3 w-28 rounded-md mt-2" />
      </div>
      <Skeleton className="w-9 h-9 rounded-btn" />
    </div>
  )
}

export default function PlannerLayout() {
  const { id } = useParams()
  const { user, loading: authLoading } = useAuth()
  const nav = useNavigate()
  const { trip, isLoading, error, canEdit } = useTrip(id)
  // Single autosave instance for the whole planner. Lifted here (the layout stays
  // mounted across sub-view navigation) so a pending debounced save survives moving
  // between sub-views and is flushed when leaving the planner.
  const { save, saving, lastSavedAt, error: saveError } = useSaveTrip(id, canEdit)

  // Auth guard — mirror the Dashboard pattern.
  useEffect(() => {
    if (!authLoading && !user) nav('/auth', { replace: true })
  }, [authLoading, user, nav])

  if (authLoading || (user && isLoading)) {
    return (
      <div className="min-h-screen bg-base text-ink">
        <HeaderSkeleton />
        <div className="px-5 md:px-8 py-8 max-w-5xl mx-auto">
          <Skeleton className="h-8 w-60 rounded-md" />
          <div className="grid gap-3 mt-6">
            {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-card" />)}
          </div>
        </div>
      </div>
    )
  }

  if (!user) return null // redirecting to /auth

  if (error || !trip) {
    return (
      <div className="min-h-screen bg-base text-ink grid place-items-center px-6">
        <div className="text-center max-w-sm">
          <h1 className="font-serif text-2xl">We couldn’t find that trip</h1>
          <p className="text-muted text-[14px] mt-2">
            It may have been deleted, or you might not have access to it.
          </p>
          <div className="mt-6">
            <Link to="/trips"><Button variant="claret">Back to your trips</Button></Link>
          </div>
        </div>
      </div>
    )
  }

  const items = navItems(trip.id)
  const linkBase =
    'inline-flex items-center justify-center gap-2 min-h-[44px] rounded-btn text-[13px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link'

  return (
    <div className="min-h-screen bg-base text-ink flex flex-col">
      <TripHeader trip={trip} canEdit={canEdit} saving={saving} lastSavedAt={lastSavedAt} saveError={saveError} />

      {/* Desktop in-trip nav — top segmented row */}
      <nav aria-label="Trip sections" className="hidden md:block border-b border-hair">
        <div className="flex items-center gap-1 px-8 py-2">
          {items.map(it => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              className={({ isActive }) =>
                cn(linkBase, 'px-4',
                  isActive ? 'bg-sig-btn text-white' : 'text-muted hover:text-ink')
              }
            >
              {({ isActive }) => (
                <span aria-current={isActive ? 'page' : undefined} className="inline-flex items-center gap-2">
                  {it.icon}{it.label}
                </span>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      {!canEdit && (
        <div className="px-4 md:px-8 py-2 bg-fill border-b border-hair text-center">
          <span className="inline-flex items-center gap-2 text-muted text-[12.5px] font-bold">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" />
            </svg>
            View only — you can browse this trip but not edit it.
          </span>
        </div>
      )}

      {/* Sub-views; pad bottom on mobile so the tab bar never covers content */}
      <main className="flex-1 pb-24 md:pb-0">
        <Outlet context={{ trip, canEdit, save, saving, lastSavedAt, saveError } satisfies PlannerOutletContext} />
      </main>

      {/* Mobile in-trip nav — fixed bottom tab bar */}
      <nav
        aria-label="Trip sections"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-hair bg-base/95 backdrop-blur"
      >
        <div className="flex items-stretch">
          {items.map(it => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              className={({ isActive }) =>
                cn('flex-1 flex flex-col items-center justify-center gap-1 min-h-[56px] py-2 text-[11px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sig-link',
                  isActive ? 'text-sig-link' : 'text-muted')
              }
            >
              {({ isActive }) => (
                <span aria-current={isActive ? 'page' : undefined} className="flex flex-col items-center gap-1">
                  {it.icon}{it.label}
                </span>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
