import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { geocodePlace, canApplyGeocode } from '../lib/geocode'
import { tripKey } from '../trip/useTrip'
import type { Trip, TripData } from '../types'

/**
 * Fire-and-forget coordinate backfill for stops added/typed without coords.
 *
 * After the stop is saved (non-blocking), forward-geocodes its name (biased by
 * the trip destination) and patches lat/lng/coords + coordinateSource:'geocoder'
 * — but ONLY through the canApplyGeocode guard: it re-reads the latest trip from
 * the query cache and applies just when the matching stop still lacks coords and
 * still matches the originating name/address. A relocate (or any coords gained)
 * mid-flight discards the result. Writes go through the caller's edit-gated,
 * immutable save. Mirrors useLandmarkBackfill.
 */
export function useGeocodeBackfill(
  tripId: string | undefined,
  save: (partial: { data: TripData }) => void,
) {
  const qc = useQueryClient()

  const backfillCoords = useCallback(
    (dayIndex: number, name: string, address: string | undefined, near: string) => {
      if (!tripId) return
      void (async () => {
        const point = await geocodePlace(name, near)
        if (!point) return
        const current = qc.getQueryData<Trip>(tripKey(tripId))
        const day = current?.data?.days?.[dayIndex]
        if (!day) return
        const idx = day.stops.findIndex(
          s => s.name === name && (address === undefined || s.address === address) &&
            canApplyGeocode(s, { name, address }),
        )
        if (idx < 0) return
        const data: TripData = {
          ...current!.data,
          days: current!.data.days.map((d, i) =>
            i === dayIndex
              ? {
                  ...d,
                  stops: d.stops.map((s, j) =>
                    j === idx
                      ? { ...s, lat: point.lat, lng: point.lng, coords: { lat: point.lat, lng: point.lng }, coordinateSource: 'geocoder' as const }
                      : s,
                  ),
                }
              : d,
          ),
        }
        save({ data })
      })()
    },
    [tripId, qc, save],
  )

  return { backfillCoords }
}
