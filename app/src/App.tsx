import { Routes, Route, Navigate } from 'react-router-dom'
import Landing from './routes/Landing'
import Auth from './routes/Auth'
import Dashboard from './routes/Dashboard'
import SplashIntro from './components/SplashIntro'
import PlannerLayout from './trip/PlannerLayout'
import Itinerary from './trip/Itinerary'
import StopDetail from './trip/StopDetail'
import TripMap from './trip/TripMap'
import Settings from './trip/Settings'

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/trips" element={<Dashboard />} />
        <Route path="/trip/:id" element={<PlannerLayout />}>
          <Route index element={<Itinerary />} />
          <Route path="stop/:day/:n" element={<StopDetail />} />
          <Route path="map" element={<TripMap />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <SplashIntro />
    </>
  )
}
