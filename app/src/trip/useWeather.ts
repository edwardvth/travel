import { useQuery } from '@tanstack/react-query'
import type { Units } from '../data/useAccountSettings'

export interface DayWeather {
  tempMax: number
  tempMin: number
  code: number
}

/** Forecast (or nulls while loading / unavailable) plus a loading flag. */
export interface UseWeatherResult {
  tempMax: number | null
  tempMin: number | null
  code: number | null
  loading: boolean
}

/**
 * Fetch a single day's forecast for some coordinates from Open-Meteo — a free,
 * no-key public API. Keyed on `['weather', lat, lng, date]` with a long
 * `staleTime` (the daily forecast barely moves), and `enabled` only when both
 * coords and a date are present.
 *
 * Fails silently: any error (network, no-key API hiccup, bad payload) leaves the
 * temps/code null, so callers render no-weather rather than an error.
 */
/** Build the Open-Meteo daily-forecast URL for a point/date in the given units. */
export function weatherUrl(lat: number, lng: number, date: string, units: Units): string {
  const base =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto` +
    `&start_date=${date}&end_date=${date}`
  // Open-Meteo defaults to celsius; only imperial needs an override.
  return units === 'imperial' ? `${base}&temperature_unit=fahrenheit` : base
}

export function useWeather(
  coords: { lat: number; lng: number } | null,
  date: string | null,
  units: Units = 'metric',
): UseWeatherResult {
  const enabled = !!coords && !!date
  const lat = coords?.lat
  const lng = coords?.lng

  const query = useQuery({
    queryKey: ['weather', lat, lng, date, units] as const,
    enabled,
    staleTime: 60 * 60 * 1000, // 1h — daily forecast is stable
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1,
    queryFn: async (): Promise<DayWeather | null> => {
      const res = await fetch(weatherUrl(lat!, lng!, date!, units))
      if (!res.ok) throw new Error(`weather ${res.status}`)
      const json: unknown = await res.json()
      const daily = (json as { daily?: Record<string, unknown[]> }).daily
      const tempMax = daily?.temperature_2m_max?.[0]
      const tempMin = daily?.temperature_2m_min?.[0]
      const code = daily?.weather_code?.[0]
      if (
        typeof tempMax !== 'number' ||
        typeof tempMin !== 'number' ||
        typeof code !== 'number'
      ) {
        return null
      }
      return { tempMax, tempMin, code }
    },
  })

  const loading = enabled && query.isLoading
  const data = query.data ?? null
  return {
    tempMax: data?.tempMax ?? null,
    tempMin: data?.tempMin ?? null,
    code: data?.code ?? null,
    loading,
  }
}
