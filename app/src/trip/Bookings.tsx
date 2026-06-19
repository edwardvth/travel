import { useOutletContext } from 'react-router-dom'
import type { PlannerOutletContext } from './PlannerLayout'
import { Bookmark } from 'lucide-react'

/**
 * Bookings section — stub. CP6 fills this with the per-stop To book → Booked
 * checklist (filtered across the whole Voyage). For now it explains the idea so
 * the route + nav entry are real and navigable.
 */
export default function Bookings() {
  // Read the lifted planner context (kept so this stays a real planner sub-view,
  // and so CP6 can build straight on top of it).
  useOutletContext<PlannerOutletContext>()

  return (
    <div className="px-5 md:px-8 py-8 max-w-3xl mx-auto">
      <h2 className="font-serif text-2xl">Bookings</h2>
      <p className="text-muted text-[13.5px] mt-1.5">
        Reservations across your Voyage, in one place.
      </p>

      <div className="mt-7 rounded-card border border-hair bg-fill px-5 py-8 text-center">
        <span className="inline-grid place-items-center w-12 h-12 rounded-full bg-base text-muted">
          <Bookmark size={22} aria-hidden="true" />
        </span>
        <h3 className="font-serif text-xl mt-4">Coming next</h3>
        <p className="text-muted text-[13.5px] mt-2 max-w-md mx-auto leading-relaxed">
          Mark any stop <span className="font-bold text-ink">To book</span>, then tap
          {' '}<span className="font-bold text-ink">Mark booked</span> once it’s set. This tab will
          gather them into a simple checklist — what’s still to book, and what’s already booked —
          for every day of your Voyage.
        </p>
      </div>
    </div>
  )
}
