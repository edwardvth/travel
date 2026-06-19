import { useOutletContext, useParams } from 'react-router-dom'
import type { PlannerOutletContext } from './PlannerLayout'

export default function StopDetail() {
  const { trip } = useOutletContext<PlannerOutletContext>()
  const { day, n } = useParams()
  return (
    <div className="px-5 md:px-8 py-8 max-w-5xl mx-auto">
      <h2 className="font-serif text-2xl">{trip.title}</h2>
      <p className="text-muted text-[14px] mt-2">Stop {n} on day {day} — detail coming soon.</p>
    </div>
  )
}
