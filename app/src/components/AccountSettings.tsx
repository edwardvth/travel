import { useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sheet } from './ui/Sheet'
import { Input } from './ui/Input'
import { Button } from './ui/Button'
import { Segmented } from './ui/Segmented'
import { ThemeToggle } from './ThemeToggle'
import { AlertTriangle, Check, ChevronRight, Loader2, Play } from 'lucide-react'
import { useAccountSettings, type Units } from '../data/useAccountSettings'
import { NARRATION_VOICES, DEFAULT_VOICE_ID, voiceLabel } from '../trip/guide/voices'
import { fetchNarrationUrl, speakFallback } from '../trip/guide/narrate'

/** One-line sample narrated when previewing a voice. */
const VOICE_SAMPLE = 'This is how your tour guide will sound as you explore each stop.'

/** AI model options — copied from the retired in-Voyage Settings. */
const AI_MODELS: { value: string; label: string }[] = [
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5 — fastest' },
  { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6 — balanced' },
  { value: 'claude-opus-4-6', label: 'Opus 4.6 — most capable' },
]
const DEFAULT_MODEL = 'claude-sonnet-4-6'

const COMING_SOON: { label: string; hint: string }[] = [
  { label: 'Subscription', hint: 'Plans & billing' },
]

/** Public legal + support links, surfaced in-app (required for App Store review). */
const LEGAL_LINKS: { label: string; to: string }[] = [
  { label: 'Privacy Policy', to: '/privacy-policy' },
  { label: 'Terms of Service', to: '/tos' },
]
const SUPPORT_EMAIL = 'support@mypassage.ai'

function Field({ htmlFor, label, children }: { htmlFor: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-[12px] font-bold text-muted uppercase tracking-wide mb-1.5">
        {label}
      </label>
      {children}
    </div>
  )
}

export function AccountSettings({
  open,
  onClose,
  userId,
}: {
  open: boolean
  onClose: () => void
  userId: string | undefined
}) {
  const { settings, setSettings } = useAccountSettings(userId)
  const titleId = useId()
  const modelId = useId()
  const keyId = useId()

  const model = settings.aiModel || DEFAULT_MODEL
  const units: Units = settings.units === 'imperial' ? 'imperial' : 'metric'
  const hasKey = !!settings.aiKey

  const [keyDraft, setKeyDraft] = useState('')

  const saveKey = () => {
    const v = keyDraft.trim()
    if (!v) return
    setSettings({ aiKey: v })
    setKeyDraft('')
  }
  const clearKey = () => {
    setSettings({ aiKey: undefined })
    setKeyDraft('')
  }

  const voiceId = settings.voiceId ?? DEFAULT_VOICE_ID
  // null = nothing playing; otherwise the voice id whose preview is loading/playing.
  const [previewing, setPreviewing] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const stopPreview = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel()
    setPreviewing(null)
  }

  const previewVoice = async (id: string) => {
    // Tapping the active preview stops it; otherwise restart from a clean state.
    if (previewing === id) {
      stopPreview()
      return
    }
    stopPreview()
    setPreviewing(id)
    const url = await fetchNarrationUrl(VOICE_SAMPLE, id)
    if (url) {
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => {
        URL.revokeObjectURL(url)
        if (audioRef.current === audio) audioRef.current = null
        setPreviewing(p => (p === id ? null : p))
      }
      audio.onerror = () => {
        URL.revokeObjectURL(url)
        if (audioRef.current === audio) audioRef.current = null
        setPreviewing(p => (p === id ? null : p))
      }
      try {
        await audio.play()
      } catch {
        URL.revokeObjectURL(url)
        audioRef.current = null
        setPreviewing(p => (p === id ? null : p))
      }
    } else {
      // No proxy audio — fall back to on-device Web Speech (no URL to revoke).
      speakFallback(VOICE_SAMPLE)
      setPreviewing(p => (p === id ? null : p))
    }
  }

  if (!open) return null

  return (
    <Sheet open={open} onClose={onClose} labelledBy={titleId}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id={titleId} className="font-serif text-2xl leading-tight">Account settings</h2>
          <p className="text-muted text-[13px] mt-0.5">Applies across all your travels.</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid place-items-center w-11 h-11 -mr-2 -mt-1 rounded-btn text-muted hover:text-ink transition-colors cursor-pointer"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="mt-6 space-y-6">
        {/* AI model */}
        <Field htmlFor={modelId} label="AI model">
          <select
            id={modelId}
            value={model}
            onChange={e => setSettings({ aiModel: e.target.value })}
            className="w-full min-h-[44px] rounded-btn bg-fill border border-hair px-4 py-3 text-[15px] text-ink outline-none focus:border-sig-link transition-colors cursor-pointer"
          >
            {AI_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <p className="text-muted text-[12.5px] mt-1.5">Used for stop facts, suggestions and trip generation. Sonnet is the recommended balance.</p>
        </Field>

        {/* Personal API key */}
        <Field htmlFor={keyId} label="Personal API key (optional)">
          <Input
            id={keyId}
            type="password"
            value={keyDraft}
            onChange={e => setKeyDraft(e.target.value)}
            placeholder={hasKey ? '•••••••• (a key is saved)' : 'sk-ant-…'}
            autoComplete="off"
            className="min-h-[44px]"
          />
          <p className="flex items-start gap-1.5 text-muted text-[12px] mt-1.5">
            <AlertTriangle size={13} aria-hidden="true" className="flex-none mt-0.5" />
            <span>Stored on this device for your account. Leave blank to use the built-in AI.</span>
          </p>
          <div className="flex gap-3 mt-3">
            <Button variant="soft" onClick={saveKey} disabled={!keyDraft.trim()}>Save key</Button>
            <Button variant="ghost" onClick={clearKey} disabled={!hasKey}>Clear key</Button>
          </div>
          {hasKey && <p className="text-sig-link text-[12.5px] mt-2">A personal key is currently saved.</p>}
        </Field>

        {/* Units */}
        <div>
          <span className="block text-[12px] font-bold text-muted uppercase tracking-wide mb-1.5">Units</span>
          <Segmented<Units>
            value={units}
            onChange={v => setSettings({ units: v })}
            options={[
              { value: 'metric', label: '°C / m' },
              { value: 'imperial', label: '°F / mi' },
            ]}
          />
          <p className="text-muted text-[12.5px] mt-1.5">Controls temperature and distance display across your travels.</p>
        </div>

        {/* Narration voice */}
        <div>
          <span className="block text-[12px] font-bold text-muted uppercase tracking-wide mb-1.5">Narration voice</span>
          <ul className="rounded-card border border-hair divide-y divide-hair overflow-hidden">
            {NARRATION_VOICES.map(v => {
              const selected = v.id === voiceId
              const isPreviewing = previewing === v.id
              return (
                <li key={v.id} className="flex items-stretch">
                  <button
                    type="button"
                    onClick={() => setSettings({ voiceId: v.id })}
                    aria-pressed={selected}
                    className={`flex flex-1 items-center gap-2.5 px-4 py-3 min-h-[44px] text-left transition-colors cursor-pointer ${
                      selected ? 'bg-fill' : 'bg-base hover:bg-fill'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`grid place-items-center w-4 h-4 flex-none rounded-full border ${
                        selected ? 'border-sig-btn bg-sig-btn text-white' : 'border-hair'
                      }`}
                    >
                      {selected && <Check size={11} strokeWidth={3} />}
                    </span>
                    <span className={`text-[14px] ${selected ? 'font-semibold text-sig-link' : 'text-ink'}`}>
                      {voiceLabel(v)}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void previewVoice(v.id)}
                    aria-label={isPreviewing ? `Stop preview of ${voiceLabel(v)}` : `Preview ${voiceLabel(v)}`}
                    aria-pressed={isPreviewing}
                    className="grid place-items-center w-11 flex-none border-l border-hair text-muted hover:text-ink hover:bg-fill transition-colors cursor-pointer"
                  >
                    {isPreviewing ? (
                      <Loader2 size={16} aria-hidden="true" className="motion-safe:animate-spin" />
                    ) : (
                      <Play size={16} aria-hidden="true" />
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
          <p className="text-muted text-[12.5px] mt-1.5">The voice used to read stop stories aloud in Guide. Syncs across your devices.</p>
        </div>

        {/* Theme */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <span className="block text-[12px] font-bold text-muted uppercase tracking-wide mb-0.5">Theme</span>
            <p className="text-muted text-[12.5px]">Switch between light and dark.</p>
          </div>
          <ThemeToggle />
        </div>

        {/* Coming soon */}
        <div className="pt-1">
          <span className="block text-[12px] font-bold text-muted uppercase tracking-wide mb-2">More</span>
          <ul className="rounded-card border border-hair divide-y divide-hair overflow-hidden">
            {COMING_SOON.map(row => (
              <li
                key={row.label}
                aria-disabled="true"
                className="flex items-center justify-between gap-3 px-4 py-3 min-h-[44px] opacity-50 select-none"
              >
                <span className="flex flex-col">
                  <span className="text-[14px] font-semibold text-ink">{row.label}</span>
                  <span className="text-[12px] text-muted">{row.hint}</span>
                </span>
                <span className="flex items-center gap-2 text-[11px] font-bold text-muted uppercase tracking-wide">
                  Coming soon
                  <ChevronRight size={15} aria-hidden="true" />
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Legal & support */}
        <div className="pt-1">
          <span className="block text-[12px] font-bold text-muted uppercase tracking-wide mb-2">Legal &amp; support</span>
          <ul className="rounded-card border border-hair divide-y divide-hair overflow-hidden">
            {LEGAL_LINKS.map(link => (
              <li key={link.to} className="flex items-stretch">
                <Link
                  to={link.to}
                  onClick={onClose}
                  className="flex flex-1 items-center justify-between gap-3 px-4 py-3 min-h-[44px] text-[14px] font-semibold text-ink bg-base hover:bg-fill transition-colors"
                >
                  {link.label}
                  <ChevronRight size={15} aria-hidden="true" className="text-muted" />
                </Link>
              </li>
            ))}
            <li className="flex items-stretch">
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="flex flex-1 items-center justify-between gap-3 px-4 py-3 min-h-[44px] text-[14px] font-semibold text-ink bg-base hover:bg-fill transition-colors"
              >
                Contact support
                <span className="text-[12px] font-normal text-muted">{SUPPORT_EMAIL}</span>
              </a>
            </li>
          </ul>
        </div>
      </div>
    </Sheet>
  )
}
