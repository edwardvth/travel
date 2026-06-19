import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { fetchLandmarkImage } from '../trip/landmark'
import { tripKey } from '../trip/useTrip'
import type { Trip, TripData } from '../types'

/**
 * Fire-and-forget landmark-image backfill for stops added to a Voyage.
 *
 * When a stop is added it has no picture; this fetches a representative
 * Wikipedia/Wikimedia landmark image for it and patches `stop.image` once it
 * arrives. It is intentionally *after the save* and non-blocking — the add UI
 * never waits on the network. On success it re-reads the latest trip from the
 * query cache (the same source `save` merges into), locates the stop on its
 * day, and only sets `image` when the stop still has neither `image` nor
 * `photos` — so a user photo or a manual image added meanwhile is never
 * clobbered. Writes go through the caller's edit-gated, immutable `save`.
 *
 * Stops are matched within their day by `name` + (optional) `address`, falling
 * back to the first nameless match — stable enough for the add path where the
 * just-added stop's identity is known.
 */
export function useLandmarkBackfill(
  tripId: string | undefined,
  save: (partial: { data: TripData }) => void,
) {
  const qc = useQueryClient()

  /**
   * Backfill one stop on `dayIndex` identified by `name`/`address`, using
   * `query` as the Wikipedia search (e.g. `"<stop name>, <city>"`).
   */
  const backfillStop = useCallback(
    (dayIndex: number, name: string, address: string | undefined, query: string) => {
      if (!tripId) return
      void (async () => {
        const url = await fetchLandmarkImage(query)
        if (!url) return
        const current = qc.getQueryData<Trip>(tripKey(tripId))
        const day = current?.data?.days?.[dayIndex]
        if (!day) return

        // Find the target stop: prefer an exact name (+address) match that still
        // lacks an image/photo, so we don't overwrite one that gained a picture.
        const idx = day.stops.findIndex(
          s =>
            s.name === name &&
            (address === undefined || s.address === address) &&
            !s.image &&
            !(s.photos && s.photos.length),
        )
        if (idx < 0) return

        const data: TripData = {
          ...current!.data,
          days: current!.data.days.map((d, i) =>
            i === dayIndex
              ? { ...d, stops: d.stops.map((s, j) => (j === idx ? { ...s, image: url } : s)) }
              : d,
          ),
        }
        save({ data })
      })()
    },
    [tripId, qc, save],
  )

  return { backfillStop }
}
