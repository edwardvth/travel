/**
 * Dynamic-import thunks for the planner routes. Shared by `App.tsx` (which wraps
 * each in `React.lazy`) and `PlannerLayout` (preload-on-intent on the tab bar).
 * Using the SAME module specifier in both places means Vite emits one chunk per
 * route, and a preloaded fetch satisfies the later `lazy()` from cache.
 */
export const importPlannerLayout = () => import('./PlannerLayout')
export const importItinerary = () => import('./Itinerary')
export const importGuide = () => import('./Guide')
export const importTrip = () => import('./Trip')
export const importStopDetail = () => import('./StopDetail')
