import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { fetchPlaceDetails } from '../lib/placeSearch'
import { findStopByPlaceId, canApplyPlaceDetails } from '../lib/geocode'
import { tripKey } from '../trip/useTrip'
import type { Trip, TripData } from '../types'

/**
 * Fire-and-forget place-details backfill for a stop just created from an
 * autocomplete pick. Resolves coords/address/types under the autocomplete
 * session token, then patches the stop — but ONLY through canApplyPlaceDetails:
 * it re-reads the latest trip from the query cache and applies just when the
 * matching stop still exists and still carries this placeId (a delete/relocate
 * mid-flight discards the result). NEVER overwrites the editable `name`. Mirrors
 * useGeocodeBackfill.
 */
export function useBackfillPlaceDetails(
  tripId: string | undefined,
  save: (partial: { data: TripData }) => void,
) {
  const qc = useQueryClient()
  const backfillPlaceDetails = useCallback((placeId: string, sessionToken: string) => {
    if (!tripId || !placeId) return
    void (async () => {
      const details = await fetchPlaceDetails(placeId, sessionToken)
      if (!details) return // by-name geocode backfill still resolves coords
      const current = qc.getQueryData<Trip>(tripKey(tripId))
      if (!current) return
      const hit = findStopByPlaceId(current, placeId)
      if (!hit || !canApplyPlaceDetails(hit.stop, placeId)) return
      const data: TripData = {
        ...current.data,
        days: current.data.days.map((d, i) => i !== hit.dayIndex ? d : {
          ...d,
          stops: d.stops.map((s, j) => j !== hit.stopIndex ? s : {
            ...s,
            lat: details.lat, lng: details.lng,
            coords: { lat: details.lat, lng: details.lng },
            ...(details.address ? { address: details.address } : {}),
            placeName: details.name || s.placeName,
            ...(details.types.length ? { placeTypes: details.types } : {}),
          }),
        }),
      }
      save({ data })
    })()
  }, [tripId, qc, save])
  return { backfillPlaceDetails }
}
