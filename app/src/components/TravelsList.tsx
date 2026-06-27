import { useMemo, useState } from 'react'
import { Search, LayoutGrid, LayoutList, X } from 'lucide-react'
import type { Trip } from '../types'
import { homeGroups, filterTrips, type HomeGroups } from '../lib/home-groups'
import { useAccountSettings } from '../data/useAccountSettings'
import { TravelTile } from './TravelTile'
import { TripRow } from './TripRow'
import { SoftBackdrop, TS } from './home-style'

/**
 * The "Your travels" block below the State-B cockpit hero: a heading + a
 * Tiles/Detailed view toggle, a search box, and the non-featured trips rendered
 * as grouped sections (Upcoming → Planning → Past) in either tiles or detailed
 * rows. View mode persists per account; search is local + clearable (✕ / Esc).
 */
export function TravelsList({
  trips, featuredId, onOpen, userId, today,
}: {
  trips: Trip[]
  featuredId: string
  onOpen: (id: string) => void
  userId?: string
  today?: string
}) {
  const { settings, setSettings } = useAccountSettings(userId)
  const view = settings.homeTravelsViewMode ?? 'tiles'
  const [query, setQuery] = useState('')

  // `homeGroups` already drops the featured trip; `featuredId` is a redundant,
  // defensive guard in case the focus selection ever diverges.
  const groups = useMemo<HomeGroups>(() => {
    const dropFeatured = (arr: Trip[]) => arr.filter(t => t.id !== featuredId)
    const g = filterTrips(homeGroups(trips, today), query)
    return {
      featured: g.featured,
      upcoming: dropFeatured(g.upcoming),
      planning: dropFeatured(g.planning),
      past: dropFeatured(g.past),
    }
  }, [trips, today, query, featuredId])

  const sections: { key: 'upcoming' | 'planning' | 'past'; label: string; items: Trip[] }[] = [
    { key: 'upcoming', label: 'Upcoming', items: groups.upcoming },
    { key: 'planning', label: 'Planning', items: groups.planning },
    { key: 'past', label: 'Past', items: groups.past },
  ]
  const empty = sections.every(s => s.items.length === 0)

  const toggleBtn = (active: boolean) =>
    `grid h-8 w-9 place-items-center rounded-full transition-colors ${active ? 'bg-white/15 text-white' : 'text-white/55 hover:text-white/80'}`

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-[clamp(22px,3.2vw,30px)] font-medium tracking-tight text-white" style={{ textShadow: TS }}>
          Your travels
        </h2>
        <div className="inline-flex items-center rounded-full border border-white/15 bg-white/[0.06] p-0.5 backdrop-blur">
          <button
            type="button"
            aria-pressed={view === 'tiles'}
            aria-label="Tiles view"
            onClick={() => setSettings({ homeTravelsViewMode: 'tiles' })}
            className={toggleBtn(view === 'tiles')}
          >
            <LayoutGrid size={16} />
          </button>
          <button
            type="button"
            aria-pressed={view === 'detailed'}
            aria-label="Detailed view"
            onClick={() => setSettings({ homeTravelsViewMode: 'detailed' })}
            className={toggleBtn(view === 'detailed')}
          >
            <LayoutList size={16} />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/45" />
        <input
          type="search"
          aria-label="Search your trips"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') setQuery('') }}
          placeholder="Search your trips…"
          className="w-full rounded-full border border-white/15 bg-white/[0.06] py-2.5 pl-10 pr-10 text-[14px] text-white placeholder-white/40 outline-none backdrop-blur transition-colors focus:border-white/30 focus:bg-white/[0.09] [&::-webkit-search-cancel-button]:appearance-none"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear trip search"
            onClick={() => setQuery('')}
            className="absolute right-2.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-white/55 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="relative">
        <SoftBackdrop />
        {empty ? (
          <p className="py-12 text-center text-[14px] text-white/55">
            {query.trim() ? `No trips match “${query}”.` : 'Your other trips will appear here.'}
          </p>
        ) : (
          <div className="flex flex-col gap-8">
            {sections.map((s) =>
              s.items.length === 0 ? null : (
                <section key={s.key}>
                  <h3 className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-white/55">{s.label}</h3>
                  {view === 'tiles' ? (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {s.items.map((t) => <TravelTile key={t.id} trip={t} onOpen={onOpen} today={today} />)}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <div className="hidden items-center gap-3.5 px-3 pb-1 text-[10.5px] uppercase tracking-[0.16em] text-white/40 md:flex">
                        <span className="w-16 shrink-0" />
                        <span className="flex-1">Trip</span>
                        <span className="w-20 shrink-0 text-center">Stops</span>
                        <span className="w-24 shrink-0 text-right">When</span>
                      </div>
                      {s.items.map((t) => <TripRow key={t.id} trip={t} onOpen={onOpen} today={today} />)}
                    </div>
                  )}
                </section>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  )
}
