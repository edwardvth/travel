import { useEffect, useRef, useState } from 'react'
import type { LatLng } from '../walk'

/** Initial great-circle bearing from `a` to `b`, degrees in [0,360). Pure. */
export function bearing(a: LatLng, b: LatLng): number {
  const toRad = Math.PI / 180
  const φ1 = a.lat * toRad
  const φ2 = b.lat * toRad
  const Δλ = (b.lng - a.lng) * toRad
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  const deg = (Math.atan2(y, x) * 180) / Math.PI
  return (deg + 360) % 360
}

const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const

/** 8-point compass label for a bearing in degrees. Pure. */
export function compassLabel(deg: number): string {
  const i = Math.round(((deg % 360) + 360) % 360 / 45) % 8
  return POINTS[i]
}

export type GeoStatus = 'idle' | 'prompt' | 'granted' | 'denied' | 'unsupported'
export interface GeoState { pos: LatLng | null; status: GeoStatus; error: string | null }

/**
 * Watch the device position while `enabled` (Guide is open/visible). Cleans up
 * on unmount / disable. Never tracks in the background. Soft-fails to a status
 * the UI can degrade on.
 */
export function useGeolocation(enabled: boolean): GeoState {
  const [state, setState] = useState<GeoState>({ pos: null, status: 'idle', error: null })
  const idRef = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled) return
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState(s => ({ ...s, status: 'unsupported' }))
      return
    }
    setState(s => ({ ...s, status: 'prompt' }))
    const id = navigator.geolocation.watchPosition(
      p => setState({ pos: { lat: p.coords.latitude, lng: p.coords.longitude }, status: 'granted', error: null }),
      err => setState(s => ({ ...s, status: err.code === err.PERMISSION_DENIED ? 'denied' : s.status, error: err.message })),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    )
    idRef.current = id
    return () => { if (idRef.current != null) navigator.geolocation.clearWatch(idRef.current) }
  }, [enabled])

  return state
}
