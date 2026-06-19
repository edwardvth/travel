import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { useProfile } from '../data/useProfile'
import { useTrips, splitTrips } from '../data/useTrips'
import { AppShell } from '../components/AppShell'
import { Button } from '../components/ui/Button'
import { Segmented } from '../components/ui/Segmented'
import { Skeleton } from '../components/ui/Skeleton'
import { TripCard } from '../components/TripCard'
import { TripRow } from '../components/TripRow'
import { EmptyState } from '../components/EmptyState'
import { NewTripSheet } from './NewTripSheet'

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth()
  const nav = useNavigate()
  const { data: profile } = useProfile(user?.id)
  const { data: trips, isLoading } = useTrips(user?.id, profile)
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming')
  const [newOpen, setNewOpen] = useState(false)

  useEffect(() => { if (!authLoading && !user) nav('/auth', { replace: true }) }, [authLoading, user, nav])

  const { upcoming, past } = useMemo(() => splitTrips(trips ?? []), [trips])
  const shown = tab === 'past' ? past : upcoming
  const featured = upcoming[0]
  const firstName = (profile?.name || user?.email?.split('@')[0] || 'traveler').split(/\s+/)[0]
  const openTrip = (id: string) => { location.assign(`/Trip.html?trip=${encodeURIComponent(id)}`) } // legacy planner until Phase 2
  const isTeaser = !!profile && profile.role !== 'founder' && (profile.credits ?? 0) < 1

  return (
    <AppShell right={<Button variant="claret" onClick={() => setNewOpen(true)}>New trip</Button>}>
      <div className="px-5 md:px-8 py-6 max-w-6xl mx-auto">
        <p className="text-muted text-[13px]">
          Good to see you, <span className="text-ink font-semibold">{firstName}</span>
          {featured ? ' — here’s what’s next.' : '.'}
        </p>

        {isLoading ? (
          <Skeleton className="h-[260px] w-full rounded-card mt-4" />
        ) : featured && tab === 'upcoming' ? (
          <div className="mt-4"><TripCard trip={featured} onOpen={openTrip} /></div>
        ) : null}

        <div className="flex items-center justify-between mt-7 mb-4">
          <h2 className="font-serif text-xl">Your trips</h2>
          <Segmented value={tab} onChange={setTab}
            options={[{ value: 'upcoming', label: `Upcoming (${upcoming.length})` }, { value: 'past', label: `Past (${past.length})` }]} />
        </div>

        {isLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{[0, 1, 2].map(i => <Skeleton key={i} className="h-[200px] rounded-card" />)}</div>
        ) : shown.length === 0 ? (
          <EmptyState title={tab === 'past' ? 'No past trips yet' : 'Your next adventure starts here'}
            body={tab === 'past' ? 'Trips you finish will land here as keepsakes.' : 'Create your first trip and plan it day by day.'}
            action={tab === 'upcoming' ? <Button variant="claret" onClick={() => setNewOpen(true)}>Plan a trip</Button> : undefined} />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {shown.map(t => <TripRow key={t.id} trip={t} onOpen={openTrip} />)}
          </div>
        )}
      </div>

      <NewTripSheet open={newOpen} onClose={() => setNewOpen(false)} isTeaser={isTeaser}
        onCreated={(id) => { setNewOpen(false); openTrip(id) }} />
    </AppShell>
  )
}
