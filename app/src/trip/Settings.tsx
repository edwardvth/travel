import { useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import type { PlannerOutletContext } from './PlannerLayout'
import { useAuth } from '../auth/useAuth'
import { useProfile, isFounder } from '../data/useProfile'
import { Segmented } from '../components/ui/Segmented'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ShareSheet } from '../routes/ShareSheet'
import {
  applyTripBasics,
  daysBetween,
  droppingDaysWithStops,
  endDateFor,
  parseImportedTrip,
  resetTripData,
} from './settings-helpers'
import type { Trip } from '../types'

type Tab = 'trip' | 'data' | 'ai' | 'units'

const AI_MODELS: { value: string; label: string }[] = [
  { value: 'claude-haiku-4-5-20251001', label: '⚡ Haiku 4.5 — fastest' },
  { value: 'claude-sonnet-4-6', label: '✨ Sonnet 4.6 — balanced' },
  { value: 'claude-opus-4-6', label: '🧠 Opus 4.6 — most capable' },
]
const DEFAULT_MODEL = 'claude-sonnet-4-6'

interface HotelShape { name?: string; address?: string; note?: string }
function readHotel(trip: Trip): HotelShape {
  const h = trip.data?.hotel
  return h && typeof h === 'object' ? (h as HotelShape) : {}
}

export default function Settings() {
  const { trip, canEdit, save } = useOutletContext<PlannerOutletContext>()
  const { user } = useAuth()
  const { data: profile } = useProfile(user?.id)
  const [tab, setTab] = useState<Tab>('trip')

  const isOwner = !!user?.id && !!trip.owner_id && trip.owner_id === user.id
  const canShare = isOwner || isFounder(profile)

  return (
    <div className="px-5 md:px-8 py-8 max-w-3xl mx-auto">
      <h2 className="font-serif text-2xl">Settings</h2>
      {!canEdit && (
        <p className="text-muted text-[13px] mt-1">View only — changes are disabled for shared trips you don’t own.</p>
      )}

      <div className="mt-5">
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'trip', label: 'Trip' },
            { value: 'data', label: 'Data' },
            { value: 'ai', label: 'AI' },
            { value: 'units', label: 'Units' },
          ]}
        />
      </div>

      <div className="mt-6">
        {tab === 'trip' && <TripTab trip={trip} canEdit={canEdit} canShare={canShare} save={save} />}
        {tab === 'data' && <DataTab trip={trip} canEdit={canEdit} save={save} />}
        {tab === 'ai' && <AITab trip={trip} canEdit={canEdit} save={save} />}
        {tab === 'units' && <UnitsTab trip={trip} canEdit={canEdit} save={save} />}
      </div>
    </div>
  )
}

type SaveFn = PlannerOutletContext['save']

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[12px] font-bold text-muted uppercase tracking-wide mb-1.5">{label}</span>
      {children}
    </label>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-card border border-hair bg-fill p-4 md:p-5 space-y-4">{children}</div>
}

// ── Trip tab ─────────────────────────────────────────────────────────────
function TripTab({ trip, canEdit, canShare, save }:
  { trip: Trip; canEdit: boolean; canShare: boolean; save: SaveFn }) {
  const startDate = trip.config?.startDate || ''
  const numDays = trip.data?.days?.length || trip.config?.numDays || 1
  const initialEnd = startDate ? endDateFor(startDate, numDays) : ''

  const [title, setTitle] = useState(trip.title || '')
  const [subtitle, setSubtitle] = useState(trip.subtitle || '')
  const [start, setStart] = useState(startDate)
  const [end, setEnd] = useState(initialEnd)
  const [shareOpen, setShareOpen] = useState(false)
  const [confirm, setConfirm] = useState<null | { newCount: number }>(null)

  const previewLabels = useMemo(() => {
    if (!start || !end) return null
    const n = daysBetween(start, end)
    return Array.from({ length: n }, (_, i) => {
      const d = endDateFor(start, i + 1)
      const [, mo, day] = d.split('-')
      const months = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      return `${months[Number(mo)]} ${Number(day)} · Day ${i + 1}`
    })
  }, [start, end])

  const hotel = readHotel(trip)
  const [hName, setHName] = useState(hotel.name || '')
  const [hAddr, setHAddr] = useState(hotel.address || '')
  const [hNote, setHNote] = useState(hotel.note || '')

  const persistBasics = (overrideEnd?: string) => {
    const effEnd = overrideEnd ?? end
    const newCount = start && effEnd ? daysBetween(start, effEnd) : numDays
    const { config, data } = applyTripBasics(trip, {
      title: title.trim() || trip.title,
      subtitle: subtitle.trim(),
      startDate: start,
      numDays: newCount,
    })
    // Fold the hotel object into data.
    const nextHotel = hName.trim()
      ? { name: hName.trim(), address: hAddr.trim() || undefined, note: hNote.trim() || undefined }
      : null
    save({ title: config.title || trip.title, subtitle: config.subtitle ?? null, config, data: { ...data, hotel: nextHotel } })
  }

  const onSave = () => {
    const newCount = start && end ? daysBetween(start, end) : numDays
    if (newCount < numDays && droppingDaysWithStops(trip.data?.days, newCount)) {
      setConfirm({ newCount })
      return
    }
    persistBasics()
  }

  return (
    <div className="space-y-5">
      <Card>
        <Field label="Title">
          <Input value={title} onChange={e => setTitle(e.target.value)} disabled={!canEdit} placeholder="e.g. NYC 2026" />
        </Field>
        <Field label="Subtitle">
          <Input value={subtitle} onChange={e => setSubtitle(e.target.value)} disabled={!canEdit} placeholder="hidden gems · rooftop dining" />
        </Field>
      </Card>

      <Card>
        <div className="grid grid-cols-2 gap-4">
          <Field label="First day">
            <Input type="date" value={start} onChange={e => setStart(e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="Last day">
            <Input type="date" value={end} min={start || undefined} onChange={e => setEnd(e.target.value)} disabled={!canEdit} />
          </Field>
        </div>
        {previewLabels && (
          <div>
            <p className="text-[12px] text-muted mb-1.5">{previewLabels.length} day{previewLabels.length === 1 ? '' : 's'}:</p>
            <div className="flex flex-wrap gap-1.5">
              {previewLabels.map((l, i) => (
                <span key={i} className="rounded-full bg-base border border-hair px-3 py-1 text-[12px] font-bold">{l}</span>
              ))}
            </div>
          </div>
        )}
      </Card>

      <Card>
        <p className="text-[11px] font-bold text-muted uppercase tracking-wide">🏨 Hotel</p>
        <Field label="Hotel name">
          <Input value={hName} onChange={e => setHName(e.target.value)} disabled={!canEdit} placeholder="Hotel Edison NYC" />
        </Field>
        <Field label="Address">
          <Input value={hAddr} onChange={e => setHAddr(e.target.value)} disabled={!canEdit} placeholder="228 W 47th St, New York" />
        </Field>
        <Field label="Notes (optional)">
          <Input value={hNote} onChange={e => setHNote(e.target.value)} disabled={!canEdit} placeholder="Check-in 3pm · confirmation #…" />
        </Field>
      </Card>

      {canEdit && (
        <div className="flex flex-wrap gap-3">
          <Button variant="claret" onClick={onSave}>Save settings</Button>
          {canShare && <Button variant="ghost" onClick={() => setShareOpen(true)}>Members &amp; share</Button>}
        </div>
      )}
      {!canEdit && canShare && (
        <Button variant="ghost" onClick={() => setShareOpen(true)}>Members &amp; share</Button>
      )}
      <p className="text-muted text-[12.5px]">Trip settings sync to all your devices automatically.</p>

      {shareOpen && <ShareSheet tripId={trip.id} open onClose={() => setShareOpen(false)} />}

      <ConfirmDialog
        open={!!confirm}
        title="Remove days with stops?"
        body="Shortening the trip will drop the last day(s), and some of them still have stops. Those stops will be deleted."
        confirmLabel="Remove days"
        onCancel={() => setConfirm(null)}
        onConfirm={() => { setConfirm(null); persistBasics() }}
      />
    </div>
  )
}

// ── Data tab ─────────────────────────────────────────────────────────────
function DataTab({ trip, canEdit, save }: { trip: Trip; canEdit: boolean; save: SaveFn }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const [resetOpen, setResetOpen] = useState(false)

  const onExport = () => {
    const payload = { id: trip.id, title: trip.title, subtitle: trip.subtitle, config: trip.config, data: trip.data }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${trip.id}.json`
    a.click()
    URL.revokeObjectURL(url)
    setMsg({ tone: 'ok', text: 'Exported as JSON.' })
  }

  const onImportFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const raw = JSON.parse(String(e.target?.result ?? ''))
        const parsed = parseImportedTrip(raw, trip)
        if (!window.confirm('Import this file? It will replace the current trip’s days, hotel and completed state.')) return
        save({ title: parsed.title, subtitle: parsed.subtitle, config: parsed.config, data: parsed.data })
        setMsg({ tone: 'ok', text: 'Imported successfully.' })
      } catch (err) {
        setMsg({ tone: 'err', text: 'Import failed: ' + (err instanceof Error ? err.message : 'unknown error') })
      }
    }
    reader.readAsText(file)
  }

  return (
    <div className="space-y-5">
      <Card>
        <p className="text-muted text-[13px]">Back up this trip to a file, or restore from one.</p>
        <div className="flex flex-wrap gap-3">
          <Button variant="soft" onClick={onExport}>📤 Export JSON</Button>
          <Button variant="soft" disabled={!canEdit} onClick={() => fileRef.current?.click()}>📥 Import JSON</Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) onImportFile(f)
              e.target.value = ''
            }}
          />
        </div>
        {msg && (
          <p className={msg.tone === 'ok' ? 'text-sig-link text-[12.5px]' : 'text-red-600 text-[12.5px]'}>{msg.text}</p>
        )}
      </Card>

      {canEdit && (
        <Card>
          <p className="text-[11px] font-bold text-muted uppercase tracking-wide">Danger zone</p>
          <p className="text-muted text-[13px]">Clear every stop, the hotel and all completed marks. The days stay, but they’ll be empty.</p>
          <Button
            variant="ghost"
            className="border-red-300 text-red-600 hover:bg-red-50"
            onClick={() => setResetOpen(true)}
          >
            🗑 Reset all data
          </Button>
        </Card>
      )}

      <ConfirmDialog
        open={resetOpen}
        title="Reset this trip?"
        body="This empties every day (stops, hotel and completed marks) for all your devices. The day count and titles are kept. This can’t be undone."
        confirmLabel="Reset trip"
        onCancel={() => setResetOpen(false)}
        onConfirm={() => {
          save({ data: resetTripData(trip) })
          setResetOpen(false)
          setMsg({ tone: 'ok', text: 'Trip data reset.' })
        }}
      />
    </div>
  )
}

// ── AI tab ───────────────────────────────────────────────────────────────
function AITab({ trip, canEdit, save }: { trip: Trip; canEdit: boolean; save: SaveFn }) {
  const cfg = trip.config as { aiModel?: string; aiKey?: string }
  const model = cfg.aiModel || DEFAULT_MODEL
  const [key, setKey] = useState('')

  const setModel = (value: string) => {
    save({ config: { ...trip.config, aiModel: value } })
  }
  const saveKey = () => {
    const v = key.trim()
    if (!v) return
    save({ config: { ...trip.config, aiKey: v } })
    setKey('')
  }
  const clearKey = () => {
    const next = { ...(trip.config as Record<string, unknown>) }
    delete next.aiKey
    save({ config: next })
  }

  const hasKey = !!cfg.aiKey

  return (
    <div className="space-y-5">
      <Card>
        <Field label="Model">
          <select
            value={model}
            disabled={!canEdit}
            onChange={e => setModel(e.target.value)}
            className="w-full rounded-btn bg-base border border-hair px-4 py-3 text-[15px] text-ink outline-none focus:border-sig-link disabled:opacity-60"
          >
            {AI_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </Field>
        <p className="text-muted text-[12.5px]">Used for stop facts, suggestions and trip generation. Sonnet is the recommended balance.</p>
      </Card>

      <Card>
        <Field label="Personal API key (optional)">
          <Input
            type="password"
            value={key}
            disabled={!canEdit}
            onChange={e => setKey(e.target.value)}
            placeholder={hasKey ? '•••••••• (a key is saved)' : 'sk-ant-…'}
            autoComplete="off"
          />
        </Field>
        <p className="text-muted text-[12px]">
          ⚠️ Stored with this trip’s settings (like the legacy app) and shared with anyone who can edit it. Leave blank to use the built-in AI.
        </p>
        {canEdit && (
          <div className="flex gap-3">
            <Button variant="soft" onClick={saveKey} disabled={!key.trim()}>Save key</Button>
            <Button variant="ghost" onClick={clearKey} disabled={!hasKey}>Clear key</Button>
          </div>
        )}
        {hasKey && <p className="text-sig-link text-[12.5px]">A personal key is currently saved for this trip.</p>}
      </Card>
    </div>
  )
}

// ── Units tab ──────────────────────────────────────────────────────────────
function UnitsTab({ trip, canEdit, save }: { trip: Trip; canEdit: boolean; save: SaveFn }) {
  const cfg = trip.config as { units?: 'metric' | 'imperial' }
  const units = cfg.units === 'imperial' ? 'imperial' : 'metric'
  const setUnits = (value: 'metric' | 'imperial') => {
    if (!canEdit) return
    save({ config: { ...trip.config, units: value } })
  }
  return (
    <Card>
      <Field label="Units">
        <div className={canEdit ? '' : 'opacity-60 pointer-events-none'}>
          <Segmented<'metric' | 'imperial'>
            value={units}
            onChange={setUnits}
            options={[
              { value: 'metric', label: '°C / m' },
              { value: 'imperial', label: '°F / mi' },
            ]}
          />
        </div>
      </Field>
      <p className="text-muted text-[12.5px]">Controls temperature and distance display across the trip.</p>
    </Card>
  )
}
