import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Landing from './routes/Landing'
import Auth from './routes/Auth'
import Dashboard from './routes/Dashboard'
import SplashIntro from './components/SplashIntro'
import { ChunkErrorBoundary } from './components/ChunkErrorBoundary'
import { RouteFallback } from './components/RouteFallbacks'
import { MaterializeOverlay } from './components/home/MaterializeOverlay'
import {
  importPlannerLayout,
  importItinerary,
  importGuide,
  importTrip,
  importStopDetail,
  importPlaceIdAdmin,
} from './trip/lazyRoutes'

// Planner routes are lazy — a Landing/Dashboard visitor never downloads them.
// Same thunks are reused by PlannerLayout for preload-on-intent (one chunk each).
const PlannerLayout = lazy(importPlannerLayout)
const Itinerary = lazy(importItinerary)
const Guide = lazy(importGuide)
const Trip = lazy(importTrip)
const StopDetail = lazy(importStopDetail)
const PlaceIdAdmin = lazy(importPlaceIdAdmin)

export default function App() {
  return (
    <>
      <ChunkErrorBoundary>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/trips" element={<Dashboard />} />
            <Route path="/admin/place-ids" element={<PlaceIdAdmin />} />
            <Route path="/trip/:id" element={<PlannerLayout />}>
              <Route index element={<Itinerary />} />
              <Route path="guide" element={<Guide />} />
              <Route path="trip" element={<Trip />} />
              <Route path="stop/:day/:n" element={<StopDetail />} />
              {/* Single-meaning redirects from the retired 4-tab nav. */}
              <Route path="bookings" element={<Navigate to="../trip" replace />} />
              <Route path="map" element={<Navigate to=".." replace />} />
              <Route path="settings" element={<Navigate to="/trips" replace />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </ChunkErrorBoundary>
      <SplashIntro />
      <MaterializeOverlay />
    </>
  )
}
