import { Search } from 'lucide-react'
import { TripGrid } from './TripGrid'
import { HomeBackground } from './HomeBackground'
import type { Trip } from '../types'

const VALUE_TRIO = [
  { k: 'Plan', d: 'Build each day with smart suggestions — places, times, and notes that just work.' },
  { k: 'Walk', d: 'A calm live guide narrates each landmark as you approach it, hands-free.' },
  { k: 'Remember', d: "Turn the trip into a beautiful story you'll actually want to share." },
]

/**
 * State C home (spec §6). Editorial "Where to next?" hero over the static
 * fallback backdrop (the field-globe shader is Phase 2). The pill-styled button
 * is the Phase-1 stand-in for the command pill — it calls `onCreate`
 * (NewTripSheet today). Brand-new users get the value trio; returning users
 * with past trips get "Past voyages" instead.
 */
export function Launchpad({
  pastTrips, onCreate, onOpenTrip, tripActions,
}: {
  pastTrips: Trip[]
  onCreate: () => void
  onOpenTrip: (id: string) => void
  tripActions?: (t: Trip) => React.ReactNode
}) {
  const hasPast = pastTrips.length > 0
  return (
    <div className="mt-4 space-y-8">
      {/* Hero over the static fallback backdrop (Phase-2 shader swaps in here). */}
      <div className="relative overflow-hidden rounded-card border border-hair px-6 py-16 text-center md:py-24">
        <HomeBackground />
        <div className="relative">
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-white/80">Plan · Walk · Remember</p>
          <h1 className="mt-3 font-serif text-[clamp(40px,6vw,64px)] font-semibold leading-[0.98] tracking-tight text-white">
            Where to next?
          </h1>
          <p className="mx-auto mt-4 max-w-md text-[14px] leading-relaxed text-white/85">
            Name a city and we'll start the itinerary, day by day.
          </p>
          <button
            onClick={onCreate}
            aria-label="Where to next — start a new trip"
            className="mx-auto mt-7 flex w-full max-w-sm items-center gap-3 rounded-full border border-white/20 bg-white/10 px-4 py-3 text-left text-white/70 backdrop-blur transition-colors hover:border-white/35 hover:bg-white/15"
          >
            <Search size={16} aria-hidden="true" className="shrink-0 text-white/60" />
            <span className="flex-1 text-[14px]">Search a city or country…</span>
            <span className="grid h-7 w-7 place-items-center rounded-full bg-sig-btn text-white" aria-hidden="true">→</span>
          </button>
        </div>
      </div>

      {hasPast ? (
        <div>
          <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.18em] text-muted">Past voyages</p>
          <TripGrid trips={pastTrips} onOpen={onOpenTrip} tripActions={tripActions} />
        </div>
      ) : (
        <div className="grid gap-8 md:grid-cols-3">
          {VALUE_TRIO.map(b => (
            <div key={b.k}>
              <div className="font-serif text-2xl">{b.k}</div>
              <p className="mt-2 text-[14px] leading-relaxed text-muted">{b.d}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
