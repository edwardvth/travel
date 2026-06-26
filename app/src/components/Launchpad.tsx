import { CinematicLaunchpad } from './CinematicLaunchpad'
import type { Trip } from '../types'

/**
 * State C home (spec §3/§6). Delegates to the cinematic launchpad: a "Where to
 * next?" CinematicHero whose clip dissolves into the night-Earth FieldGlobe, with
 * "Your travels" on glass cards beneath. Keeps this stable prop signature so
 * Dashboard never changes when the launchpad's internals evolve.
 */
export function Launchpad({
  pastTrips, onCreate, onOpenTrip, tripActions,
}: {
  pastTrips: Trip[]
  onCreate: () => void
  onOpenTrip: (id: string) => void
  tripActions?: (t: Trip) => React.ReactNode
}) {
  return (
    <CinematicLaunchpad
      pastTrips={pastTrips}
      onCreate={onCreate}
      onOpenTrip={onOpenTrip}
      tripActions={tripActions}
    />
  )
}
