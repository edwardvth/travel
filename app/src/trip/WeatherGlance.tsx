import type { Trip } from '../types'
import { useWeather } from './useWeather'
import { dayDate, formatDayDate, dayAnchorCoords } from './helpers'
import { weatherFromCode } from './icons'

/**
 * Slim weather glance atop a day's Plan: weekday · date · temp range · condition.
 * Graceful by design — renders a subtle date-only line when there are no coords
 * (or weather is unavailable), and nothing at all when there's no date either.
 * Never an error or a blank gap; the row height is reserved to avoid layout shift.
 */
export function WeatherGlance({ trip, day }: { trip: Trip; day: number }) {
  const date = dayDate(trip, day)
  const coords = dayAnchorCoords(trip, day)
  const { tempMax, tempMin, code, loading } = useWeather(coords, date)

  const dateLabel = formatDayDate(date)
  const hasWeather = tempMax !== null && tempMin !== null && code !== null

  // No date and no weather → nothing to show.
  if (!dateLabel && !hasWeather) return null

  const { label, icon: Icon } = hasWeather ? weatherFromCode(code) : { label: '', icon: null }
  const max = hasWeather ? Math.round(tempMax) : null
  const min = hasWeather ? Math.round(tempMin) : null

  return (
    <div className="mb-3 flex h-5 items-center gap-1.5 text-[13px] text-muted">
      {Icon ? <Icon size={15} aria-hidden="true" className="shrink-0 opacity-80" /> : null}
      {dateLabel ? <span>{dateLabel}</span> : null}
      {hasWeather ? (
        <>
          <span aria-hidden="true" className="opacity-50">·</span>
          <span>
            {max}° / {min}°
          </span>
          <span aria-hidden="true" className="opacity-50">·</span>
          <span className="capitalize">{label}</span>
        </>
      ) : (
        // Reserve the line subtly while loading so weather can fade in without shift.
        coords && loading && <span className="opacity-50" aria-hidden="true">·</span>
      )}
    </div>
  )
}
