import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { useProfile } from '../data/useProfile'
import { useTrips, splitTrips, useBackfillCoverImage } from '../data/useTrips'
import { AppShell } from '../components/AppShell'
import { Button } from '../components/ui/Button'
import { Segmented } from '../components/ui/Segmented'
import { Skeleton } from '../components/ui/Skeleton'
import { TripCard } from '../components/TripCard'
import { TripRow } from '../components/TripRow'
import { EmptyState } from '../components/EmptyState'
import { NewTripSheet } from './NewTripSheet'
import { useDeleteTrip } from '../data/useTrips'
import { isFounder } from '../data/useProfile'
import { ShareSheet } from './ShareSheet'
import { AccountMenu } from '../components/AccountMenu'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { IconButton } from '../components/ui/IconButton'

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth()
  const nav = useNavigate()
  const { data: profile } = useProfile(user?.id)
  const { data: trips, isLoading } = useTrips(user?.id, profile)
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming')
  const [newOpen, setNewOpen] = useState(false)

  useEffect(() => { if (!authLoading && !user) nav('/auth', { replace: true }) }, [authLoading, user, nav])

  const { upcoming, past } = useMemo(() => splitTrips(trips ?? []), [trips])
  const del = useDeleteTrip()
  const backfillCover = useBackfillCoverImage()

  // One-time, best-effort cover backfill for existing trips that predate cover
  // storage (or whose abbreviated titles never resolved). For each trip the user
  // can manage that has no usable cover (no stored `coverImage` and no stop with
  // an `.image`), we try once — tracked in `attemptedCovers` so a re-render or a
  // `['trips']` re-validation never re-fires the same trip this session. Runs
  // sequentially (awaited one at a time) to stay gentle on Wikipedia/Supabase,
  // and is fully silent: failures just leave the placeholder.
  const attemptedCovers = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!user || !trips) return
    const canBackfill = (t: typeof trips[number]) =>
      isFounder(profile) || (!!t.owner_id && t.owner_id === user.id)
    const hasUsableCover = (t: typeof trips[number]) =>
      !!t.config?.coverImage || !!t.data?.days?.flatMap(d => d.stops ?? [])?.find(s => s.image)
    const pending = trips.filter(
      t => canBackfill(t) && !hasUsableCover(t) && !attemptedCovers.current.has(t.id),
    )
    if (pending.length === 0) return
    let cancelled = false
    void (async () => {
      for (const t of pending) {
        if (cancelled) return
        attemptedCovers.current.add(t.id)
        try { await backfillCover(t) } catch { /* best-effort, ignore */ }
      }
    })()
    return () => { cancelled = true }
  }, [trips, user, profile, backfillCover])
  const [shareId, setShareId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const canManage = (t: typeof upcoming[number]) => isFounder(profile) || (!!t.owner_id && t.owner_id === user?.id)
  const tripActions = (t: typeof upcoming[number]) => canManage(t) ? (
    <>
      <IconButton label="Share trip" onClick={() => setShareId(t.id)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" strokeLinecap="round"/></svg>
      </IconButton>
      <IconButton label="Delete trip" onClick={() => setDeleteId(t.id)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </IconButton>
    </>
  ) : undefined
  const shown = tab === 'past' ? past : upcoming
  const featured = upcoming[0]
  const firstName = (profile?.name || user?.email?.split('@')[0] || 'traveler').split(/\s+/)[0]
  const openTrip = (id: string) => { nav(`/trip/${encodeURIComponent(id)}`) } // new React planner (Phase 2); legacy /Trip.html stays as fallback
  const isTeaser = !!profile && profile.role !== 'founder' && (profile.credits ?? 0) < 1

  return (
    <AppShell right={<><AccountMenu email={user?.email ?? ''} profile={profile} /><Button variant="claret" onClick={() => setNewOpen(true)}>New trip</Button></>}>
      <div className="px-5 md:px-8 py-6 max-w-6xl mx-auto">
        <p className="text-muted text-[13px]">
          Good to see you, <span className="text-ink font-semibold">{firstName}</span>
          {featured ? ' — here’s what’s next.' : '.'}
        </p>

        {isLoading ? (
          <Skeleton className="h-[260px] w-full rounded-card mt-4" />
        ) : featured && tab === 'upcoming' ? (
          <div className="mt-4"><TripCard trip={featured} onOpen={openTrip} actions={tripActions(featured)} /></div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mt-7 mb-4">
          <h2 className="font-serif text-xl">Your trips</h2>
          <Segmented value={tab} onChange={setTab}
            options={[{ value: 'upcoming', label: `Upcoming (${upcoming.length})` }, { value: 'past', label: `Past (${past.length})` }]} />
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{[0, 1, 2].map(i => <Skeleton key={i} className="h-[200px] rounded-card" />)}</div>
        ) : shown.length === 0 ? (
          <EmptyState title={tab === 'past' ? 'No past trips yet' : 'Your next adventure starts here'}
            body={tab === 'past' ? 'Trips you finish will land here as keepsakes.' : 'Create your first trip and plan it day by day.'}
            action={tab === 'upcoming' ? <Button variant="claret" onClick={() => setNewOpen(true)}>Plan a trip</Button> : undefined} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {shown.map(t => <TripRow key={t.id} trip={t} onOpen={openTrip} actions={tripActions(t)} />)}
          </div>
        )}
      </div>

      <NewTripSheet open={newOpen} onClose={() => setNewOpen(false)} isTeaser={isTeaser}
        onCreated={(id) => { setNewOpen(false); openTrip(id) }} />

      {shareId && <ShareSheet tripId={shareId} open onClose={() => setShareId(null)} />}
      <ConfirmDialog open={!!deleteId} title="Delete this trip?"
        body="This removes the trip and all its stops. This can't be undone."
        confirmLabel="Delete" busy={del.isPending}
        onCancel={() => setDeleteId(null)}
        onConfirm={async () => { if (deleteId) { try { await del.mutateAsync(deleteId) } catch { /* ignore */ } setDeleteId(null) } }} />
    </AppShell>
  )
}
