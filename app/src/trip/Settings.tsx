import { useOutletContext } from 'react-router-dom'
import type { PlannerOutletContext } from './PlannerLayout'

export default function Settings() {
  const { trip, canEdit } = useOutletContext<PlannerOutletContext>()
  return (
    <div className="px-5 md:px-8 py-8 max-w-5xl mx-auto">
      <h2 className="font-serif text-2xl">{trip.title}</h2>
      <p className="text-muted text-[14px] mt-2">
        Settings coming soon.{!canEdit && ' (view-only)'}
      </p>
    </div>
  )
}
