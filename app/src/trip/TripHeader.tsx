import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ThemeToggle } from '../components/ThemeToggle'
import { AccountMenu } from '../components/AccountMenu'
import { ShareSheet } from '../routes/ShareSheet'
import { SyncIndicator } from './SyncIndicator'
import { useAuth } from '../auth/useAuth'
import { useProfile } from '../data/useProfile'
import { formatDateRange } from '../lib/trip-helpers'
import type { Trip } from '../types'

/**
 * Planner top bar: back to /trips, trip title in Fraunces + date range, the
 * autosave SyncIndicator, a Share button, and the theme toggle. The actual
 * in-trip tab nav lives in PlannerLayout. Sync state is owned by PlannerLayout's
 * single useSaveTrip instance and passed down here.
 */
export function TripHeader({
  trip,
  canEdit,
  saving = false,
  lastSavedAt = null,
  saveError = null,
}: {
  trip: Trip
  canEdit: boolean
  saving?: boolean
  lastSavedAt?: string | null
  saveError?: Error | null
}) {
  const [shareOpen, setShareOpen] = useState(false)
  const { user } = useAuth()
  const { data: profile } = useProfile(user?.id)
  const dates = formatDateRange(trip)

  return (
    <header className="flex items-center gap-3 px-4 md:px-8 py-3 border-b border-hair bg-base">
      <Link
        to="/trips"
        aria-label="Back to your trips"
        className="grid place-items-center w-11 h-11 -ml-2 rounded-btn text-muted hover:text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </Link>

      <div className="min-w-0 flex-1">
        <h1 className="font-serif text-[17px] md:text-xl leading-tight truncate">{trip.title}</h1>
        {dates && <p className="text-muted text-[12px] md:text-[13px] truncate">{dates}</p>}
      </div>

      {/* Autosave status */}
      <SyncIndicator
        canEdit={canEdit}
        saving={saving}
        lastSavedAt={lastSavedAt}
        saveError={saveError}
        className="mr-1"
      />

      {canEdit && (
        <button
          type="button"
          onClick={() => setShareOpen(true)}
          aria-label="Share trip"
          className="grid place-items-center w-11 h-11 rounded-btn text-muted hover:text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
            <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" strokeLinecap="round" />
          </svg>
        </button>
      )}

      <ThemeToggle />

      {/* Global account affordance — reachable in-trip on desktop and mobile.
          It is account-scoped (sign-out, account settings), never trip-scoped. */}
      <AccountMenu email={user?.email ?? ''} profile={profile} />

      {shareOpen && <ShareSheet tripId={trip.id} open onClose={() => setShareOpen(false)} />}
    </header>
  )
}
