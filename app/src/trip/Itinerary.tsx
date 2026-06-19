import { useOutletContext } from 'react-router-dom'
import type { PlannerOutletContext } from './PlannerLayout'

export default function Itinerary() {
  const { trip } = useOutletContext<PlannerOutletContext>()
  return (
    <div className="px-5 md:px-8 py-8 max-w-5xl mx-auto">
      <h2 className="font-serif text-2xl">{trip.title}</h2>
      <p className="text-muted text-[14px] mt-2">Itinerary coming soon.</p>
    </div>
  )
}
