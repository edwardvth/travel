import type { Stop } from '../types'
import { normalizeDuration, defaultDurationMinutes } from './duration'

/** A day past this many planned minutes is flagged "full". */
export const OVERLOAD_MINUTES = 11 * 60

export interface DayUtilization {
  stops: number
  minutes: number
  hours: number
  overloaded: boolean
}

/** Planned minutes for one stop: its explicit duration, else a per-kind default. */
function stopMinutes(s: Stop): number {
  return normalizeDuration(s.duration) ?? defaultDurationMinutes(s)
}

/** Derived day load: stop count + planned minutes/hours + overloaded flag. Pure. */
export function dayUtilization(stops: readonly Stop[]): DayUtilization {
  const minutes = stops.reduce((sum, s) => sum + stopMinutes(s), 0)
  return {
    stops: stops.length,
    minutes,
    hours: Math.round(minutes / 60),
    overloaded: minutes > OVERLOAD_MINUTES,
  }
}
