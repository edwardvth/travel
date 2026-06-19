import { useEffect, useMemo, useRef, useState } from 'react'
import type * as Leaflet from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { dayCount, dayLabel, dayStops } from './helpers'
import { cn } from '../lib/utils'
import type { Stop, Trip } from '../types'

/** A stop+index selection shared between the list and the map. */
export interface MapSelection {
  day: number
  n: number
}

/** Map scope: a single day index, or every day at once. */
export type MapScope = 'all' | number

export interface TripMapViewProps {
  trip: Trip
  /** Which day(s) to render: a day index, or 'all'. */
  scope: MapScope
  /** Currently selected stop (highlighted pin + open popup), if any. */
  selected?: MapSelection | null
  /** Fired when a marker is clicked — list should select that stop. */
  onSelect?: (sel: MapSelection) => void
  /** Fired when a popup's "Open" button is clicked — navigate to detail. */
  onOpen?: (sel: MapSelection) => void
  className?: string
}

/** A stop that has resolved, finite coordinates plus its position in the trip. */
interface MappedStop {
  day: number
  index: number
  lat: number
  lng: number
  stop: Stop
}

/** Pull finite lat/lng out of a stop (supports both flat lat/lng and nested coords). */
function stopCoords(stop: Stop): { lat: number; lng: number } | null {
  const lat = stop.lat ?? stop.coords?.lat
  const lng = stop.lng ?? stop.coords?.lng
  if (typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng }
  }
  return null
}

/** Distinct, readable hue per day index (mirrors legacy renderAllMap color ramp). */
function dayColor(day: number, total: number): string {
  const n = Math.max(total, 1)
  return `hsl(${Math.round((day * 360) / n)}, 65%, 48%)`
}

/** The claret signature, used for single-day routes (matches the design tokens). */
const CLARET = '#8b2942'

/** Escape user text before injecting into Leaflet popup HTML. */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Build the divIcon HTML for a pin; selected pins are larger + brighter. */
function pinIcon(L: typeof Leaflet, color: string, order: number, isSelected: boolean): Leaflet.DivIcon {
  const size = isSelected ? 38 : 28
  const fontSize = isSelected ? 14 : 11
  const ring = isSelected ? 3 : 2.5
  const glow = isSelected
    ? `0 0 0 3px ${color}55, 0 4px 14px rgba(0,0,0,0.5)`
    : '0 2px 8px rgba(0,0,0,0.4)'
  return L.divIcon({
    className: '',
    html:
      `<div style="background:${color};color:#fff;width:${size}px;height:${size}px;border-radius:50% 50% 50% 0;` +
      `transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;` +
      `border:${ring}px solid #fff;box-shadow:${glow};">` +
      `<span style="transform:rotate(45deg);font-size:${fontSize}px;font-weight:800;">${order}</span></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size - 2],
    popupAnchor: [0, -(size - 4)],
  })
}

/**
 * Read-only Leaflet map of a trip's stops for a given scope. Owns the full
 * Leaflet lifecycle (StrictMode-safe init/teardown, divIcon pins, fitBounds,
 * light/dark tiles, escaped popups). Markers fire `onSelect`; popups expose an
 * "Open" button that fires `onOpen`. The `selected` stop is highlighted.
 */
export default function TripMapView({
  trip, scope, selected, onSelect, onOpen, className,
}: TripMapViewProps) {
  // Bumps once the map instance exists, so the render effect re-runs.
  const [ready, setReady] = useState(0)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<Leaflet.Map | null>(null)
  const layerRef = useRef<Leaflet.LayerGroup | null>(null)
  const leafletRef = useRef<typeof Leaflet | null>(null)
  // Keep the latest callbacks in refs so popup/marker handlers never go stale.
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const onOpenRef = useRef(onOpen)
  onOpenRef.current = onOpen

  const totalDays = dayCount(trip)

  // Mapped stops for the current scope, computed from trip data.
  const mapped = useMemo<MappedStop[]>(() => {
    const out: MappedStop[] = []
    const days = scope === 'all' ? Array.from({ length: totalDays }, (_, i) => i) : [scope]
    for (const day of days) {
      dayStops(trip, day).forEach((stop, index) => {
        const c = stopCoords(stop)
        if (c) out.push({ day, index, lat: c.lat, lng: c.lng, stop })
      })
    }
    return out
  }, [trip, scope, totalDays])

  // Create the Leaflet map once, when the container is ready. jsdom-safe.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    // Feature-detect a real DOM/layout engine — jsdom lacks it, so skip there.
    if (typeof window === 'undefined' || typeof el.getBoundingClientRect !== 'function') return

    let cancelled = false

    // Dynamic import keeps Leaflet out of the module graph during jsdom tests
    // and guarantees the CSS-side default-icon work never runs server-side.
    import('leaflet')
      .then((mod) => {
        if (cancelled || !containerRef.current) return
        const L = (mod as { default?: typeof Leaflet }).default ?? (mod as unknown as typeof Leaflet)
        leafletRef.current = L

        // StrictMode guard: if a map already lives on this node, reuse it.
        if (mapRef.current) return

        const isLight = document.documentElement.classList.contains('light')
        const map = L.map(containerRef.current, {
          zoomControl: true,
          attributionControl: true,
          scrollWheelZoom: false,
        }).setView([20, 0], 2)

        // Tasteful CARTO tiles — light/dark mirrors the app theme.
        const tileUrl = isLight
          ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
          : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        L.tileLayer(tileUrl, {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap &copy; CARTO',
        }).addTo(map)

        layerRef.current = L.layerGroup().addTo(map)
        mapRef.current = map

        // Force a re-run of the render effect now that the map exists.
        setReady((n) => n + 1)
      })
      .catch(() => {
        /* Leaflet unavailable (e.g. test env) — degrade silently. */
      })

    return () => {
      cancelled = true
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
        layerRef.current = null
      }
    }
  }, [])

  // Render markers + polylines whenever scope/trip/selection changes (or the map appears).
  useEffect(() => {
    const map = mapRef.current
    const L = leafletRef.current
    const layer = layerRef.current
    if (!map || !L || !layer) return

    layer.clearLayers()
    if (mapped.length === 0) return

    const bounds = L.latLngBounds([])
    let selectedMarker: Leaflet.Marker | null = null

    // Group mapped stops by day so we can draw an ordered route per day.
    const byDay = new Map<number, MappedStop[]>()
    for (const m of mapped) {
      const arr = byDay.get(m.day) ?? []
      arr.push(m)
      byDay.set(m.day, arr)
    }

    for (const [day, stops] of byDay) {
      const color = scope === 'all' ? dayColor(day, totalDays) : CLARET
      const line = stops.map((s) => [s.lat, s.lng] as [number, number])
      if (line.length > 1) {
        L.polyline(line, {
          color,
          weight: 4,
          opacity: scope === 'all' ? 0.55 : 0.85,
          dashArray: scope === 'all' ? '8,5' : '10,6',
        }).addTo(layer)
      }

      stops.forEach((m) => {
        bounds.extend([m.lat, m.lng])
        const order = m.index + 1
        const isSelected = !!selected && selected.day === m.day && selected.n === m.index
        const icon = pinIcon(L, color, order, isSelected)

        const label = scope === 'all' ? `${esc(dayLabel(trip, m.day))} · Stop ${order}` : `Stop ${order}`
        const meta = [m.stop.time, m.stop.type].filter(Boolean).map((t) => esc(String(t))).join(' · ')
        const popupHtml =
          `<div style="min-width:160px;font-family:system-ui,sans-serif;">` +
          `<div style="color:${color};font-size:11px;font-weight:800;">${label}</div>` +
          `<div style="font-size:14px;font-weight:700;margin-top:2px;">${esc(m.stop.name || 'Untitled stop')}</div>` +
          (meta ? `<div style="color:#888;font-size:12px;margin-top:2px;">${meta}</div>` : '') +
          (m.stop.address ? `<div style="color:#888;font-size:11px;margin-top:2px;">${esc(m.stop.address)}</div>` : '') +
          `<button type="button" data-open-stop style="margin-top:8px;width:100%;padding:7px 8px;` +
          `border:none;border-radius:8px;background:${color};color:#fff;font-size:12px;font-weight:700;cursor:pointer;">` +
          `Open stop &rsaquo;</button></div>`

        const marker = L.marker([m.lat, m.lng], { icon, zIndexOffset: isSelected ? 1000 : 0 })
          .addTo(layer)
          .bindPopup(popupHtml)
        if (isSelected) selectedMarker = marker

        // Clicking a marker selects that stop in the list.
        marker.on('click', () => onSelectRef.current?.({ day: m.day, n: m.index }))
        marker.on('popupopen', (e: Leaflet.PopupEvent) => {
          const node = (e.popup.getElement() as HTMLElement | undefined)?.querySelector('[data-open-stop]')
          node?.addEventListener(
            'click',
            () => onOpenRef.current?.({ day: m.day, n: m.index }),
            { once: true },
          )
        })
      })
    }

    // Fit bounds to everything shown.
    try {
      map.invalidateSize()
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 })
    } catch {
      /* fitBounds can throw on degenerate bounds — ignore. */
    }

    // Pan to + open the selected marker's popup after fitBounds settles.
    if (selectedMarker) {
      const mk = selectedMarker as Leaflet.Marker
      try {
        map.panTo(mk.getLatLng(), { animate: true })
        mk.openPopup()
      } catch {
        /* panTo/openPopup can throw on a not-yet-laid-out map — ignore. */
      }
    }
  }, [mapped, scope, trip, totalDays, selected, ready])

  const hasStops = mapped.length > 0

  return (
    <div className={cn('relative', className)}>
      <div
        ref={containerRef}
        data-testid="trip-map"
        className="absolute inset-0 bg-fill"
        role="region"
        aria-label="Trip map"
      />
      {!hasStops && (
        <div className="absolute inset-0 grid place-items-center pointer-events-none px-6">
          <div className="text-center max-w-xs pointer-events-auto bg-raised/90 backdrop-blur rounded-card border border-hair px-6 py-6 shadow-soft">
            <div className="mx-auto w-11 h-11 rounded-full bg-fill grid place-items-center mb-3">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-muted" aria-hidden="true">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
            </div>
            <h3 className="font-serif text-lg">No mapped stops yet</h3>
            <p className="text-muted text-[13.5px] mt-1.5">
              {scope === 'all'
                ? 'Add places with locations and they’ll appear here on the map.'
                : 'This day has no stops with a location yet — add places with coordinates to see the route.'}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
