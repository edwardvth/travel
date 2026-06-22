import { Skeleton } from './ui/Skeleton'

/**
 * Page-level Suspense fallback — shown while a lazy route chunk (e.g. the
 * planner shell) loads. Fills the viewport with a calm, branded skeleton so
 * there's no flash of blank between routes.
 */
export function RouteFallback() {
  return (
    <div className="min-h-screen bg-base px-5 md:px-8 py-6" role="status" aria-label="Loading">
      <div className="mx-auto w-full max-w-md space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-[160px] w-full rounded-[18px]" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </div>
  )
}

/**
 * Content-area Suspense fallback — shown while a planner *tab* chunk loads.
 * Sized to the planner body (the shell stays mounted around it), so switching
 * tabs never blanks the day rail / header / tab bar.
 */
export function PlannerContentFallback() {
  return (
    <div className="px-5 md:px-8 py-6 md:py-8" role="status" aria-label="Loading">
      <div className="mx-auto w-full max-w-md space-y-4">
        <Skeleton className="h-[160px] w-full rounded-[18px]" />
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-24 w-full rounded-md" />
      </div>
    </div>
  )
}
