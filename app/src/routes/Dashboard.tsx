import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Plus } from 'lucide-react'
import { useAuth } from '../auth/useAuth'
import { useProfile, isFounder } from '../data/useProfile'
import { useTrips, splitTrips, useDeleteTrip, useBackfillCoverImage, useBackfillDestination, useReresolveAutoCover } from '../data/useTrips'
import { classifyCover } from '../trip/landmark-context'
import { selectFocusTrip } from '../lib/focus-trip'
import { AppShell } from '../components/AppShell'
import { Button } from '../components/ui/Button'
import { Segmented } from '../components/ui/Segmented'
import { Skeleton } from '../components/ui/Skeleton'
import { Cockpit } from '../components/Cockpit'
import { Launchpad } from '../components/Launchpad'
import { TripGrid } from '../components/TripGrid'
import { AddTripTile } from '../components/AddTripTile'
import { NewTripSheet } from './NewTripSheet'
import { ShareSheet } from './ShareSheet'
import { AccountMenu } from '../components/AccountMenu'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { IconButton } from '../components/ui/IconButton'

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth()
  const nav = useNavigate()
  const reduce = useReducedMotion()
  const { data: profile } = useProfile(user?.id)
  const { data: trips, isLoading } = useTrips(user?.id, profile)
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming')
  const [newOpen, setNewOpen] = useState(false)

  useEffect(() => { if (!authLoading && !user) nav('/auth', { replace: true }) }, [authLoading, user, nav])

  const { upcoming, past } = useMemo(() => splitTrips(trips ?? []), [trips])
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
      classifyCover(t.config?.coverImage) === 'auto' ||
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
  const focus = useMemo(() => selectFocusTrip(trips ?? []), [trips])
  const firstName = (profile?.name || user?.email?.split('@')[0] || 'traveler').split(/\s+/)[0]
  const openTrip = (id: string) => { nav(`/trip/${encodeURIComponent(id)}`) }            // → Plan
  const openArrange = (id: string) => { nav(`/trip/${encodeURIComponent(id)}/trip`) }    // → Trip view
  const isTeaser = !!profile && profile.role !== 'founder' && (profile.credits ?? 0) < 1
  const hasTrips = (trips?.length ?? 0) > 0

  // Single creation entry point. Phase 1 → NewTripSheet; Phase 3 swaps this for the pill.
  const openCreateTrip = () => setNewOpen(true)

  // Greeting varies by state: cockpit / returning / brand-new.
  const greeting = focus
    ? <>Good to see you, <span className="font-semibold text-ink">{firstName}</span> — here's what's next.</>
    : past.length > 0
      ? <>Welcome back, <span className="font-semibold text-ink">{firstName}</span>.</>
      : <>Welcome, <span className="font-semibold text-ink">{firstName}</span>.</>

  const tabSwap = (r: boolean) => ({
    initial: r ? false : { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: r ? { opacity: 0 } : { opacity: 0, y: -8 },
    transition: { duration: 0.22, ease: 'easeOut' as const },
  })

  return (
    <AppShell right={<>
      <Button variant="claret" onClick={openCreateTrip}><Plus size={16} strokeWidth={2.5} />New trip</Button>
      <AccountMenu email={user?.email ?? ''} profile={profile} />
    </>}>
      <div className="px-5 md:px-8 py-6 max-w-6xl mx-auto">
        {isLoading ? (
          <>
            <Skeleton className="h-4 w-56 rounded" />
            <Skeleton className="mt-4 h-[300px] w-full rounded-card md:h-[360px]" />
            <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map(i => <Skeleton key={i} className="h-[200px] rounded-card" />)}
            </div>
          </>
        ) : !hasTrips ? (
          <>
            <p className="text-[13px] text-muted">{greeting}</p>
            <Launchpad pastTrips={[]} onCreate={openCreateTrip} onOpenTrip={openTrip} tripActions={tripActions} />
          </>
        ) : focus ? (
          <>
            <p className="text-[13px] text-muted">{greeting}</p>
            <div className="mt-4">
              <Cockpit trip={focus} onOpen={openTrip} onOpenArrange={openArrange} actions={tripActions(focus)} />
            </div>

            <div className="mt-7 mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <h2 className="font-serif text-xl">Your trips</h2>
              <Segmented value={tab} onChange={setTab}
                options={[{ value: 'upcoming', label: `Upcoming (${upcoming.length})` }, { value: 'past', label: `Past (${past.length})` }]} />
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={tab} {...tabSwap(!!reduce)}>
                {shown.length === 0 ? (
                  tab === 'upcoming'
                    ? <AddTripTile onClick={openCreateTrip} label="Plan your next escape" sub="Add a trip" className="min-h-[200px]" />
                    : <p className="py-12 text-center text-[14px] text-muted">Trips you finish will land here as keepsakes.</p>
                ) : (
                  <TripGrid trips={shown} onOpen={openTrip} tripActions={tripActions} onAdd={tab === 'upcoming' ? openCreateTrip : undefined} />
                )}
              </motion.div>
            </AnimatePresence>
          </>
        ) : (
          <>
            <p className="text-[13px] text-muted">{greeting}</p>
            <Launchpad pastTrips={past} onCreate={openCreateTrip} onOpenTrip={openTrip} tripActions={tripActions} />
          </>
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
