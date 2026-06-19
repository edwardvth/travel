import { Routes, Route, Navigate } from 'react-router-dom'
import Landing from './routes/Landing'
import Auth from './routes/Auth'
import Dashboard from './routes/Dashboard'
import SplashIntro from './components/SplashIntro'
import PlannerLayout from './trip/PlannerLayout'
import Itinerary from './trip/Itinerary'
import Guide from './trip/Guide'
import Trip from './trip/Trip'
import StopDetail from './trip/StopDetail'

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/trips" element={<Dashboard />} />
        <Route path="/trip/:id" element={<PlannerLayout />}>
          <Route index element={<Itinerary />} />
          <Route path="guide" element={<Guide />} />
          <Route path="trip" element={<Trip />} />
          <Route path="stop/:day/:n" element={<StopDetail />} />
          {/* Single-meaning redirects from the retired 4-tab nav. These are nested
              under /trip/:id, so the relative targets resolve against the trip. */}
          <Route path="bookings" element={<Navigate to="../trip" replace />} />
          <Route path="map" element={<Navigate to=".." replace />} />
          <Route path="settings" element={<Navigate to="/trips" replace />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <SplashIntro />
    </>
  )
}
