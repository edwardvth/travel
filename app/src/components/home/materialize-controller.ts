/**
 * Transition state for the seed-card flight (spec §4.1). Lives OUTSIDE React
 * component state so it survives the route change from home → planner. A tiny
 * observable: the home triggers `begin`, the overlay subscribes and animates,
 * the planner (or a timeout) calls `arrive`/`fail` to hand off.
 */
export interface SeedPayload {
  destination: string
  rangeLabel: string            // "Jul 14 → Jul 18" | "Dates TBD"
  coverUrl: string | null       // cache-only peek result (null → gradient)
  sourceRect: DOMRect | null    // the pill's measured bounds
}
export type MaterializeStatus = 'idle' | 'flying' | 'arrived' | 'failed'

type Listener = () => void

class MaterializeController {
  status: MaterializeStatus = 'idle'
  payload: SeedPayload | null = null
  private listeners = new Set<Listener>()

  subscribe(l: Listener): () => void { this.listeners.add(l); return () => this.listeners.delete(l) }
  private emit() { this.listeners.forEach(l => l()) }

  begin(payload: SeedPayload) { this.payload = payload; this.status = 'flying'; this.emit() }
  arrive() { if (this.status === 'flying') { this.status = 'arrived'; this.emit() } }
  fail() { if (this.status === 'flying') { this.status = 'failed'; this.emit() } }
  reset() { this.status = 'idle'; this.payload = null; this.emit() }
}

export const materialize = new MaterializeController()
