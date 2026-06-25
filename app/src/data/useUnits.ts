import { useAuth } from '../auth/useAuth'
import { useAccountSettings, type Units } from './useAccountSettings'

/**
 * The signed-in account's unit preference (°C/m vs °F/mi), defaulting to metric.
 * Wraps auth + account settings so weather/distance readouts can honour the
 * preference the Account Settings panel writes (previously stored but unread).
 * Must be used within AuthProvider.
 */
export function useUnits(): Units {
  const { user } = useAuth()
  const { settings } = useAccountSettings(user?.id)
  return settings.units ?? 'metric'
}
