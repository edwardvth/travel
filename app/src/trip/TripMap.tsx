import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import type * as Leaflet from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { PlannerOutletContext } from './PlannerLayout'
import { dayCount, dayLabel, dayStops } from './helpers'
import { cn } from '../lib/utils'
import type { Stop } from '../types'

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

type Scope = 'all' | number

export default function TripMap() {
  const { trip } = useOutletContext<PlannerOutletContext>()
  const navigate = useNavigate()

  const [scope, setScope] = useState<Scope>('all')
  // Bumps once the map instance exists, so the render effect re-runs.
  const [ready, setReady] = useState(0)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<Leaflet.Map | null>(null)
  const layerRef = useRef<Leaflet.LayerGroup | null>(null)
  const leafletRef = useRef<typeof Leaflet | null>(null)
  // Keep the latest navigate in a ref so popup click handlers never go stale.
  const navRef = useRef(navigate)
  navRef.current = navigate

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

  // Render markers + polylines whenever scope/trip changes (or the map appears).
  useEffect(() => {
    const map = mapRef.current
    const L = leafletRef.current
    const layer = layerRef.current
    if (!map || !L || !layer) return

    layer.clearLayers()
    if (mapped.length === 0) return

    const bounds = L.latLngBounds([])

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
        const icon = L.divIcon({
          className: '',
          html:
            `<div style="background:${color};color:#fff;width:28px;height:28px;border-radius:50% 50% 50% 0;` +
            `transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;` +
            `border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.4);">` +
            `<span style="transform:rotate(45deg);font-size:11px;font-weight:800;">${order}</span></div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 26],
          popupAnchor: [0, -24],
        })

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

        const marker = L.marker([m.lat, m.lng], { icon }).addTo(layer).bindPopup(popupHtml)
        marker.on('popupopen', (e: Leaflet.PopupEvent) => {
          const node = (e.popup.getElement() as HTMLElement | undefined)?.querySelector('[data-open-stop]')
          node?.addEventListener(
            'click',
            () => navRef.current(`/trip/${trip.id}/stop/${m.day}/${m.index}`),
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
  }, [mapped, scope, trip, totalDays, ready])

  const dayChips = Array.from({ length: totalDays }, (_, i) => i)
  const hasStops = mapped.length > 0

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] min-h-[420px]">
      {/* Day selector */}
      <div className="px-4 md:px-8 py-3 border-b border-hair">
        <div className="flex items-center gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Map day">
          <button
            type="button"
            role="tab"
            aria-selected={scope === 'all'}
            onClick={() => setScope('all')}
            className={cn(
              'shrink-0 px-3.5 py-2 rounded-btn text-[13px] font-bold transition-colors min-h-[40px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link',
              scope === 'all' ? 'bg-sig-btn text-white' : 'bg-fill text-muted hover:text-ink',
            )}
          >
            All days
          </button>
          {dayChips.map((d) => (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={scope === d}
              onClick={() => setScope(d)}
              className={cn(
                'shrink-0 inline-flex items-center gap-2 px-3.5 py-2 rounded-btn text-[13px] font-bold transition-colors min-h-[40px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link',
                scope === d ? 'bg-sig-btn text-white' : 'bg-fill text-muted hover:text-ink',
              )}
            >
              <span
                aria-hidden="true"
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ background: dayColor(d, totalDays) }}
              />
              {dayLabel(trip, d)}
            </button>
          ))}
        </div>
      </div>

      {/* Map area */}
      <div className="relative flex-1">
        <div
          ref={containerRef}
          data-testid="trip-map"
          className="absolute inset-0 bg-fill"
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
    </div>
  )
}
