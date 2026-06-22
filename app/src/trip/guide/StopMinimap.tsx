import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type * as Leaflet from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Skeleton } from '../../components/ui/Skeleton'
import { stylizedPath } from './minimap-geom'
import type { LatLng } from '../walk'

/** Claret destination pin (lucide map-pin glyph) as a Leaflet divIcon. */
function destIcon(L: typeof Leaflet) {
  return L.divIcon({
    className: '',
    html:
      '<div style="color:var(--sig-btn);filter:drop-shadow(0 2px 3px rgba(0,0,0,.55))">' +
      '<svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" stroke="#fff" stroke-width="1.2">' +
      '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3" fill="#fff" stroke="none"/></svg></div>',
    iconSize: [30, 30],
    iconAnchor: [15, 28],
  })
}

/** Pulsing user-location dot (reuses the global `vyPulse` keyframe, which stills
 *  under prefers-reduced-motion). */
function userIcon(L: typeof Leaflet) {
  return L.divIcon({
    className: '',
    html:
      '<div style="position:relative;width:18px;height:18px">' +
      '<span style="position:absolute;inset:0;border-radius:9999px;background:var(--sig-btn);opacity:.35;animation:vyPulse 1.6s ease-in-out infinite"></span>' +
      '<span style="position:absolute;inset:5px;border-radius:9999px;background:#fff;border:2px solid var(--sig-btn)"></span></div>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  })
}

/**
 * A single-stop **orientation** minimap for the Guide hero. Shows the
 * destination, the user (when located), and a stylized direct path — never a
 * routed/navigation line. Pinch-zoom + double-tap only (no pan), so the swipe
 * deck keeps its one-finger horizontal gesture. Leaflet is dynamically imported
 * (its own chunk) and skipped under jsdom.
 */
/** Imperative zoom handle so the card's control layer can drive the map. */
export interface StopMinimapHandle {
  zoomIn: () => void
  zoomOut: () => void
}

export const StopMinimap = forwardRef<
  StopMinimapHandle,
  {
    destination: LatLng
    user: LatLng | null
    stopName: string
    className?: string
    /** Fired `true` on the first pointer down on the map and `false` when the
     *  last pointer lifts — lets the parent disable the swipe deck while the user
     *  pans/pinches, so the two gesture systems never fight. */
    onInteracting?: (active: boolean) => void
  }
>(function StopMinimap({ destination, user, stopName, className, onInteracting }, ref) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<Leaflet.Map | null>(null)
  const leafletRef = useRef<typeof Leaflet | null>(null)
  const layerRef = useRef<Leaflet.LayerGroup | null>(null)
  // Fit the view exactly once (on open); after that, respect the user's zoom/pan
  // and never auto-re-fit on a GPS update (that was zooming the map back out).
  const fittedRef = useRef(false)
  const [ready, setReady] = useState(0)

  useImperativeHandle(
    ref,
    () => ({
      zoomIn: () => mapRef.current?.zoomIn(),
      zoomOut: () => mapRef.current?.zoomOut(),
    }),
    [],
  )

  // Create the map once (jsdom-safe, StrictMode-safe), like TripMapView.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    if (typeof window === 'undefined' || typeof el.getBoundingClientRect !== 'function') return
    let cancelled = false
    import('leaflet')
      .then((mod) => {
        if (cancelled || !containerRef.current) return
        const L = (mod as { default?: typeof Leaflet }).default ?? (mod as unknown as typeof Leaflet)
        leafletRef.current = L
        if (mapRef.current) return
        const map = L.map(containerRef.current, {
          dragging: true, // pan enabled — the deck lock (onInteracting) prevents conflict
          touchZoom: true,
          doubleClickZoom: true,
          scrollWheelZoom: false,
          zoomControl: false,
          attributionControl: false,
          keyboard: false,
        }).setView([destination.lat, destination.lng], 15)
        const isLight = document.documentElement.classList.contains('light')
        const tileUrl = isLight
          ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
          : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        L.tileLayer(tileUrl, { maxZoom: 19 }).addTo(map)
        layerRef.current = L.layerGroup().addTo(map)
        mapRef.current = map
        setReady((n) => n + 1)
      })
      .catch(() => {})
    return () => {
      cancelled = true
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
        layerRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fit the view to user + destination, or center on the destination alone.
  const fitView = () => {
    const L = leafletRef.current
    const map = mapRef.current
    if (!L || !map) return
    if (user) {
      try {
        const b = L.latLngBounds([
          [user.lat, user.lng],
          [destination.lat, destination.lng],
        ])
        if (b.isValid()) map.fitBounds(b, { padding: [38, 38], maxZoom: 16 })
      } catch {
        /* degenerate bounds — ignore */
      }
    } else {
      map.setView([destination.lat, destination.lng], 15)
    }
  }
  // Latest-closure ref so the resize observer always fits with current points.
  const fitRef = useRef(fitView)
  fitRef.current = fitView

  // Draw / redraw the pins + path when the map is ready or the points change.
  useEffect(() => {
    const L = leafletRef.current
    const map = mapRef.current
    const layer = layerRef.current
    if (!L || !map || !layer) return
    layer.clearLayers()
    // Leaflet writes the polyline color to an SVG `stroke` *attribute*, where a
    // CSS var won't resolve — read the concrete claret value instead. (The
    // divIcons above use var() in a `style` attribute, where it does resolve.)
    const claret =
      getComputedStyle(document.documentElement).getPropertyValue('--sig-btn').trim() || '#B0473F'
    L.marker([destination.lat, destination.lng], { icon: destIcon(L) }).addTo(layer)
    if (user) {
      L.marker([user.lat, user.lng], { icon: userIcon(L) }).addTo(layer)
      L.polyline(stylizedPath(user, destination).map((p) => [p.lat, p.lng] as [number, number]), {
        color: claret,
        weight: 3,
        opacity: 0.9,
        dashArray: '1 7',
        lineCap: 'round',
      }).addTo(layer)
    }
    // Frame the view only on the first draw; later GPS updates just move the dot.
    if (!fittedRef.current) {
      fitView()
      fittedRef.current = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, destination.lat, destination.lng, user?.lat, user?.lng])

  // Keep Leaflet sized to its container: fixes a blank map when the container
  // was mid-layout at init, and re-fits while the hero animates open to a square.
  useEffect(() => {
    const map = mapRef.current
    const el = containerRef.current
    if (!map || !el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      try {
        map.invalidateSize()
        fitRef.current()
      } catch {
        /* invalidateSize can throw mid-teardown — ignore */
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [ready])

  // Gesture ownership: while any pointer is down on the map, tell the parent to
  // disable the Guide swipe deck so pan/pinch never trigger a stop change.
  // Pointer-count based (pinch = two fingers) and lifecycle-driven (no timers);
  // releases the lock if we unmount mid-interaction so the deck never sticks.
  const onInteractingRef = useRef(onInteracting)
  onInteractingRef.current = onInteracting
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let pointers = 0
    const down = () => {
      pointers += 1
      if (pointers === 1) onInteractingRef.current?.(true)
    }
    const up = () => {
      if (pointers === 0) return
      pointers -= 1
      if (pointers === 0) onInteractingRef.current?.(false)
    }
    // Capture phase so we fire before Leaflet's own handlers can stopPropagation.
    el.addEventListener('pointerdown', down, true)
    window.addEventListener('pointerup', up, true)
    window.addEventListener('pointercancel', up, true)
    return () => {
      el.removeEventListener('pointerdown', down, true)
      window.removeEventListener('pointerup', up, true)
      window.removeEventListener('pointercancel', up, true)
      if (pointers > 0) onInteractingRef.current?.(false) // unmounted mid-gesture
    }
  }, [])

  return (
    <div className={'relative h-full w-full ' + (className ?? '')}>
      <div
        ref={containerRef}
        className="absolute inset-0 bg-fill"
        role="img"
        aria-label={`Minimap: your location relative to ${stopName}`}
      />
      {ready === 0 && (
        <div className="absolute inset-0" role="status" aria-label="Loading minimap">
          <Skeleton className="absolute inset-0 rounded-none" />
        </div>
      )}
      {ready > 0 && !user && (
        <div className="absolute inset-x-0 bottom-0 px-3 py-2 text-center text-[11px] text-white bg-black/45 backdrop-blur-[3px]">
          Enable location to see where you are
        </div>
      )}
    </div>
  )
})

export default StopMinimap
