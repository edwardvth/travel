import { isCompleted } from '../helpers'
import { stopLandmarkQuery } from '../landmark-context'

/** First not-completed stop index in `dayIndex`, or -1 if all done. Pure. */
export function currentStopIndex(dayIndex: number, stopNames: string[], completed: string[] | undefined): number {
  for (let i = 0; i < stopNames.length; i++) {
    if (!isCompleted(completed, dayIndex, i)) return i
  }
  return -1
}

/** Wikipedia query for a stop's hero image — ALWAYS name + city. Pure. */
export function stopHeroQuery(stopName: string, destination: string): string {
  return stopLandmarkQuery(stopName, destination)
}
