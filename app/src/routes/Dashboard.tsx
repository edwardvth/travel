import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { useProfile, isFounder } from '../data/useProfile'
import { useTrips, useDeleteTrip, useBackfillCoverImage, useBackfillDestination, useReresolveAutoCover } from '../data/useTrips'
import { classifyCover } from '../trip/landmark-context'
import { selectFocusTrip } from '../lib/focus-trip'
import { COVER_LOGIC_VERSION } from '../trip/cover-image'
import { useUnits } from '../data/useUnits'
import { HomePage } from '../components/HomePage'
import { ShareSheet } from './ShareSheet'
import { AccountMenu } from '../components/AccountMenu'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { IconButton } from '../components/ui/IconButton'

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth()
  const nav = useNavigate()
  const units = useUnits()
  const { data: profile } = useProfile(user?.id)
  const { data: trips } = useTrips(user?.id, profile)

  useEffect(() => { if (!authLoading && !user) nav('/auth', { replace: true }) }, [authLoading, user, nav])

  const del = useDeleteTrip()
  const backfillCover = useBackfillCoverImage()
  const backfillDestination = useBackfillDestination()
  const reresolveCover = useReresolveAutoCover()

  // One-time, best-effort backfill for trips the user can manage. Per trip we:
  //  1. infer + save a real `config.destination` from its stops if it's missing
  //     (legacy trips that predate the destination field), then
  //  2. correct the cover — re-resolve a baked-in AUTO (possibly-wrong, e.g. a
  //     suitcase) Wikipedia cover now the destination is right, or backfill one
  //     when there's none at all.
  // A trip is attempted once (tracked in `attemptedCovers`) so a re-render or a
  // `['trips']` re-validation never re-fires it this session. Runs sequentially
  // (awaited one at a time) to stay gentle on the AI proxy / Wikipedia / Supabase,
  // and is fully silent: failures just leave the existing state.
  const attemptedCovers = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!user || !trips) return
    const canBackfill = (t: typeof trips[number]) =>
      isFounder(profile) || (!!t.owner_id && t.owner_id === user.id)
    const hasDestination = (t: typeof trips[number]) =>
      typeof t.config?.destination === 'string' && t.config.destination.trim().length > 0
    const hasStops = (t: typeof trips[number]) =>
      !!t.data?.days?.some(d => (d.stops?.length ?? 0) > 0)
    const hasUsableCover = (t: typeof trips[number]) =>
      !!t.config?.coverImage || !!t.data?.days?.flatMap(d => d.stops ?? [])?.find(s => s.image)
    // Needs work when it can infer a missing destination from stops, OR has a
    // baked-in auto (possibly-wrong) cover, OR has no usable cover at all.
    const needsWork = (t: typeof trips[number]) =>
      (!hasDestination(t) && hasStops(t)) ||
      (classifyCover(t.config?.coverImage) === 'auto' && t.config?.coverVersion !== COVER_LOGIC_VERSION) ||
      !hasUsableCover(t)
    const pending = trips.filter(
      t => canBackfill(t) && needsWork(t) && !attemptedCovers.current.has(t.id),
    )
    if (pending.length === 0) return
    let cancelled = false
    void (async () => {
      for (const t of pending) {
        if (cancelled) return
        attemptedCovers.current.add(t.id)
        try {
          await backfillDestination(t)
          if (classifyCover(t.config?.coverImage) === 'auto') await reresolveCover(t)
          else if (!t.config?.coverImage) await backfillCover(t)
        } catch { /* best-effort, ignore */ }
      }
    })()
    return () => { cancelled = true }
  }, [trips, user, profile, backfillCover, backfillDestination, reresolveCover])

  const [shareId, setShareId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const canManage = (t: NonNullable<typeof trips>[number]) => isFounder(profile) || (!!t.owner_id && t.owner_id === user?.id)
  const tripActions = (t: NonNullable<typeof trips>[number]) => canManage(t) ? (
    <>
      <IconButton label="Share travel" onClick={() => setShareId(t.id)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" strokeLinecap="round"/></svg>
      </IconButton>
      <IconButton label="Delete travel" onClick={() => setDeleteId(t.id)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </IconButton>
    </>
  ) : undefined

  const focus = useMemo(() => selectFocusTrip(trips ?? []), [trips])
  const firstName = (profile?.name || user?.email?.split('@')[0] || 'traveler').split(/\s+/)[0]
  const accountControls = <AccountMenu email={user?.email ?? ''} profile={profile} />

  return (
    <>
      <HomePage
        trips={trips ?? []}
        focus={focus}
        firstName={firstName}
        units={units}
        userId={user?.id}
        loading={!trips}
        accountControls={accountControls}
        tripActions={tripActions}
      />
      {shareId && <ShareSheet tripId={shareId} open onClose={() => setShareId(null)} />}
      <ConfirmDialog open={!!deleteId} title="Delete this travel?"
        body="This removes the travel and all its stops. This can't be undone."
        confirmLabel="Delete" busy={del.isPending}
        onCancel={() => setDeleteId(null)}
        onConfirm={async () => { if (deleteId) { try { await del.mutateAsync(deleteId) } catch { /* ignore */ } setDeleteId(null) } }} />
    </>
  )
}
