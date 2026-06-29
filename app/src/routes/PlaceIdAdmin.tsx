import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { useProfile, isFounder } from '../data/useProfile'
import { placeIdAdmin, type ReviewRow, type ScanStats } from '../data/usePlaceIdAdmin'
import { Button } from '../components/ui/Button'

export default function PlaceIdAdmin() {
  const { user } = useAuth()
  const { data: profile } = useProfile(user?.id)
  const [running, setRunning] = useState(false)
  const [stats, setStats] = useState<ScanStats | null>(null)
  const [pending, setPending] = useState<number | null>(null)
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [busyId, setBusyId] = useState<number | null>(null)
  const [bulk, setBulk] = useState<{ running: boolean; done: number } | null>(null)

  if (!profile) return null // wait for the profile query before deciding access (no flash of the admin UI)
  if (!isFounder(profile)) return <Navigate to="/trips" replace />

  const loadMetrics = async () => { try { setPending((await placeIdAdmin.metrics()).pending_review) } catch { /* ignore */ } }
  const loadList = async () => { try { setRows((await placeIdAdmin.list()).rows) } catch { /* ignore */ } }

  const runBackfill = async () => {
    setRunning(true)
    const agg = { processed: 0, tagged: 0, queued: 0, google_failures: 0 }
    let cursor: string | undefined
    try {
      // Drive pagination until the function reports done. The guard is a safety
      // valve against a non-advancing cursor (server would otherwise loop forever).
      for (let i = 0; i < 10_000; i++) {
        const s = await placeIdAdmin.scan(cursor)
        agg.processed += s.processed; agg.tagged += s.tagged; agg.queued += s.queued; agg.google_failures += s.google_failures
        setStats({ ...s, ...agg })
        if (s.done || s.cursor === cursor) break // done, or cursor stalled → stop
        cursor = s.cursor
      }
    } catch { /* surfaced via stats halt */ }
    setRunning(false)
    await Promise.all([loadMetrics(), loadList()])
  }

  const decide = async (fn: () => Promise<{ status: string }>, id: number) => {
    setBusyId(id)
    try { await fn() } finally { setBusyId(null); await Promise.all([loadMetrics(), loadList()]) }
  }

  // Bulk-accept the TOP candidate (candidates[0]) for every pending row, paging
  // through the whole queue. Rows with no candidate are left for manual handling
  // (tracked in `seen` so the loop can't spin on them).
  const acceptAllFirst = async () => {
    setBulk({ running: true, done: 0 })
    const seen = new Set<number>()
    let done = 0
    try {
      for (let guard = 0; guard < 500; guard++) {
        const batch = (await placeIdAdmin.list()).rows.filter((r) => !seen.has(r.id))
        if (batch.length === 0) break // queue empty, or only un-attachable rows remain
        for (const row of batch) {
          seen.add(row.id)
          const first = row.candidates?.[0]
          if (!first) continue // no candidate to accept → leave for manual review
          try { await placeIdAdmin.attach(row.id, first.placeId); done++; setBulk({ running: true, done }) } catch { /* skip on error */ }
        }
      }
    } catch { /* stop on error */ }
    setBulk({ running: false, done })
    await Promise.all([loadMetrics(), loadList()])
  }

  return (
    <div className="mx-auto max-w-3xl p-6 space-y-6 text-ink">
      <header className="space-y-1">
        <h1 className="font-serif text-2xl">PlaceId Backfill</h1>
        <p className="text-muted text-sm">Tag legacy stops to Google places so they join the shared cache.</p>
      </header>

      <section className="rounded-xl border border-hair bg-raised p-4 space-y-3">
        <div className="flex items-center gap-3">
          <Button onClick={loadMetrics} variant="ghost">Refresh metrics</Button>
          <Button onClick={runBackfill} disabled={running}>{running ? 'Running…' : 'Run backfill'}</Button>
        </div>
        {pending != null && <p className="text-sm text-muted font-mono">pending review: {pending}</p>}
        {stats && (
          <p className="text-sm text-muted font-mono">
            processed {stats.processed} &middot; tagged {stats.tagged} &middot; queued {stats.queued}
            {stats.google_failures ? ` · google errors ${stats.google_failures}` : ''}
          </p>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-serif text-lg">Review queue {rows.length > 0 && <span className="text-muted font-mono text-sm">({rows.length})</span>}</h2>
          <div className="flex items-center gap-2">
            <Button onClick={loadList} variant="ghost" disabled={bulk?.running}>Load</Button>
            <Button onClick={acceptAllFirst} disabled={bulk?.running}>{bulk?.running ? `Accepting… ${bulk.done}` : 'Accept top match for all'}</Button>
          </div>
        </div>
        {bulk && !bulk.running && <p className="text-sm text-muted font-mono">accepted {bulk.done} top matches</p>}
        {rows.length === 0 && <p className="text-muted text-sm">No pending rows loaded.</p>}
        {rows.map((row) => (
          <div key={row.id} className="rounded-xl border border-hair bg-base p-4 space-y-2">
            <div className="text-sm">
              <span className="font-medium">{row.stop_name}</span>
              <span className="text-muted"> &middot; score {row.score.toFixed(2)}</span>
            </div>
            <ul className="space-y-1">
              {row.candidates.map((c) => (
                <li key={c.placeId} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted">
                    {c.name}{c.address ? ` · ${c.address}` : ''}{c.distanceM != null ? ` · ${c.distanceM}m` : ''}
                    {c.types?.length ? ` · ${c.types.slice(0, 2).join(', ')}` : ''}
                  </span>
                  <Button variant="ghost" disabled={busyId === row.id} onClick={() => decide(() => placeIdAdmin.attach(row.id, c.placeId), row.id)}>This one</Button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Button variant="ghost" disabled={busyId === row.id} onClick={() => decide(() => placeIdAdmin.skip(row.id), row.id)}>Not a place</Button>
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}
