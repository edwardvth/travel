import { Suspense, useEffect } from 'react'
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { useTrip } from './useTrip'
import { useSaveTrip, type SavePartial } from './useSaveTrip'
import { TripHeader } from './TripHeader'
import { Skeleton } from '../components/ui/Skeleton'
import { ChunkErrorBoundary } from '../components/ChunkErrorBoundary'
import { PlannerContentFallback } from '../components/RouteFallbacks'
import { importGuide, importTrip, importItinerary } from './lazyRoutes'
import { Button } from '../components/ui/Button'
import { cn } from '../lib/utils'
import { dayCount, dayLabel } from './helpers'
import { materialize } from '../components/home/materialize-controller'
import { Briefcase, CalendarDays, Compass, Eye, LayoutList } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Trip } from '../types'

export interface PlannerOutletContext {
  trip: Trip
  canEdit: boolean
  /** Debounced, edit-gated autosave — single instance lifted to the layout. */
  save: (partial: SavePartial) => void
  saving: boolean
  lastSavedAt: string | null
  saveError: Error | null
  /** Selected day index (lifted to the layout, mirrored to `?day=N`). */
  activeDay: number
  setActiveDay: (day: number) => void
}

interface SectionItem {
  to: string
  label: string
  end?: boolean
  Icon: LucideIcon
  preload: () => Promise<unknown>
}

/** The named sections (Plan is implicit — the index route, with the Day list
 *  nested beneath it). Guide · Trip live in the sidebar / tab bar; together with
 *  the implicit Plan they form the three intent-tabs Plan · Guide · Trip. */
function sectionItems(id: string): SectionItem[] {
  return [
    { to: `/trip/${id}/guide`, label: 'Guide', Icon: Compass, preload: importGuide },
    { to: `/trip/${id}/trip`, label: 'Manage', Icon: Briefcase, preload: importTrip },
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
  useEffect(() => { materialize.arrive() }, [])
  const { id } = useParams()
  const { user, loading: authLoading } = useAuth()
  const nav = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
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
          <h1 className="font-serif text-2xl">We couldn’t find that travel</h1>
          <p className="text-muted text-[14px] mt-2">
            It may have been deleted, or you might not have access to it.
          </p>
          <div className="mt-6">
            <Link to="/trips"><Button variant="claret">Back to your travels</Button></Link>
          </div>
        </div>
      </div>
    )
  }

  // ── Lifted day selection ──────────────────────────────────────────────────
  // Single source of truth: `?day=N`, clamped to the trip's day count. The
  // desktop sidebar day list and the mobile day chips both drive it through the
  // outlet context. Selecting a day while on Guide/Trip returns to the Plan
  // index so the chosen day actually shows.
  const days = dayCount(trip)
  const rawDay = Number.parseInt(searchParams.get('day') ?? '', 10)
  const activeDay = Number.isFinite(rawDay) ? Math.min(Math.max(rawDay, 0), Math.max(0, days - 1)) : 0

  // "Plan" is the index route (no /guide, /trip, /stop segment).
  const planPath = `/trip/${trip.id}`
  const onPlan = location.pathname === planPath || location.pathname === `${planPath}/`

  function setActiveDay(day: number) {
    const clamped = Math.min(Math.max(day, 0), Math.max(0, days - 1))
    if (onPlan) {
      // Stay on Plan — just update the query (preserve other params).
      setSearchParams(prev => {
        const next = new URLSearchParams(prev)
        next.set('day', String(clamped))
        return next
      })
    } else {
      // From a section → go back to Plan for that day.
      nav(`${planPath}?day=${clamped}`)
    }
  }

  const items = sectionItems(trip.id)

  return (
    // Lock the planner shell to the dynamic viewport height (dvh dodges the mobile
    // address-bar jump) and let the <main> flex child own the remaining space, so the
    // split view can scroll its own column without the whole page overflowing.
    <div className="h-[100dvh] min-h-0 bg-base text-ink flex flex-col overflow-hidden">
      <TripHeader trip={trip} canEdit={canEdit} saving={saving} lastSavedAt={lastSavedAt} saveError={saveError} />

      {!canEdit && (
        <div className="px-4 md:px-8 py-2 bg-fill border-b border-hair text-center">
          <span className="inline-flex items-center gap-2 text-muted text-[12.5px] font-bold">
            <Eye size={14} aria-hidden="true" />
            View only — you can browse this trip but not edit it.
          </span>
        </div>
      )}

      {/* Body: desktop = persistent left sidebar + main; mobile = main only. */}
      <div className="flex-1 min-h-0 flex">
        {/* Desktop sidebar — Day list (top, nested under Plan) → hairline → Guide · Trip */}
        <nav
          aria-label="Travel navigation"
          className="hidden md:flex flex-col w-[200px] flex-none border-r border-hair overflow-y-auto py-3 px-2.5"
        >
          <div className="flex flex-col gap-0.5">
            {Array.from({ length: Math.max(days, 1) }, (_, day) => {
              const selected = onPlan && day === activeDay
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => setActiveDay(day)}
                  aria-current={selected ? 'page' : undefined}
                  className={cn(
                    'inline-flex items-center gap-2.5 min-h-[40px] px-3 rounded-btn text-left text-[13px] font-bold transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link',
                    selected ? 'bg-sig-btn text-white' : 'text-muted hover:text-ink hover:bg-fill',
                  )}
                >
                  <CalendarDays size={15} aria-hidden="true" className="flex-none" />
                  <span className="truncate">{dayLabel(trip, day)}</span>
                </button>
              )
            })}
          </div>

          <div className="h-px bg-hair my-2.5 mx-1.5" role="presentation" />

          <div className="flex flex-col gap-0.5">
            {items.map(({ to, label, end, Icon, preload }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onPointerEnter={preload}
                onFocus={preload}
                onTouchStart={preload}
                className={({ isActive }) =>
                  cn(
                    'inline-flex items-center gap-2.5 min-h-[40px] px-3 rounded-btn text-left text-[13px] font-bold transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link',
                    isActive ? 'bg-fill text-ink' : 'text-muted hover:text-ink hover:bg-fill',
                  )
                }
              >
                {({ isActive }) => (
                  <span aria-current={isActive ? 'page' : undefined} className="inline-flex items-center gap-2.5">
                    <Icon size={15} aria-hidden="true" className="flex-none" />
                    {label}
                  </span>
                )}
              </NavLink>
            ))}
          </div>
        </nav>

        {/* Sub-views fill the remaining height as a flex column. `min-h-0` lets a child
            (the split view) own its own scroll; tall views (StopDetail/Guide/Trip)
            fall back to scrolling the page via this container's overflow.
            Pad bottom on mobile so the fixed tab bar never covers content. */}
        <main className="flex-1 min-w-0 min-h-0 flex flex-col overflow-y-auto pb-24 md:pb-0">
          <ChunkErrorBoundary>
            <Suspense fallback={<PlannerContentFallback />}>
              <Outlet
                context={{ trip, canEdit, save, saving, lastSavedAt, saveError, activeDay, setActiveDay } satisfies PlannerOutletContext}
              />
            </Suspense>
          </ChunkErrorBoundary>
        </main>
      </div>

      {/* Mobile bottom tab bar — Plan · Guide · Trip */}
      <nav
        aria-label="Travel navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-hair bg-base/95 backdrop-blur"
      >
        <div className="flex items-stretch">
          {/* Plan tab — index route, keeps the active day. */}
          <NavLink
            to={`${planPath}${activeDay ? `?day=${activeDay}` : ''}`}
            end
            onPointerEnter={importItinerary}
            onFocus={importItinerary}
            onTouchStart={importItinerary}
            className={({ isActive }) =>
              cn(
                'flex-1 flex flex-col items-center justify-center gap-1 min-h-[44px] py-2 text-[11px] font-bold transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sig-link',
                isActive ? 'text-sig-link' : 'text-muted',
              )
            }
          >
            {({ isActive }) => (
              <span aria-current={isActive ? 'page' : undefined} className="flex flex-col items-center gap-1">
                <LayoutList size={18} aria-hidden="true" />
                Plan
              </span>
            )}
          </NavLink>

          {items.map(({ to, label, end, Icon, preload }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onPointerEnter={preload}
              onFocus={preload}
              onTouchStart={preload}
              className={({ isActive }) =>
                cn(
                  'flex-1 flex flex-col items-center justify-center gap-1 min-h-[44px] py-2 text-[11px] font-bold transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sig-link',
                  isActive ? 'text-sig-link' : 'text-muted',
                )
              }
            >
              {({ isActive }) => (
                <span aria-current={isActive ? 'page' : undefined} className="flex flex-col items-center gap-1">
                  <Icon size={18} aria-hidden="true" />
                  {label}
                </span>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
