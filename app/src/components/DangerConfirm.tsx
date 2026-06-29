// app/src/components/DangerConfirm.tsx
import { useState } from 'react'
import { Sheet } from './ui/Sheet'
import { Button } from './ui/Button'
import { Input } from './ui/Input'

/**
 * A destructive confirm that requires typing an exact word (e.g. "DELETE") to
 * enable the action — used for account deletion. Stronger than ConfirmDialog.
 */
export function DangerConfirm({
  open, title, body, confirmWord, confirmLabel, busy, error, onCancel, onConfirm,
}: {
  open: boolean; title: string; body: string; confirmWord: string; confirmLabel: string
  busy?: boolean; error?: string; onCancel: () => void; onConfirm: () => void
}) {
  const [text, setText] = useState('')
  const matches = text === confirmWord
  return (
    <Sheet open={open} onClose={onCancel} labelledBy="danger-title">
      <h2 id="danger-title" className="font-serif text-2xl">{title}</h2>
      <p className="text-muted text-[14px] mt-2">{body}</p>
      <label className="block text-[12px] font-bold text-muted uppercase tracking-wide mt-5 mb-1.5">
        Type {confirmWord} to confirm
      </label>
      <Input aria-label={`Type ${confirmWord} to confirm`} value={text} autoComplete="off"
        onChange={e => setText(e.target.value)} className="min-h-[44px]" />
      {error && <p className="text-sig-link text-[13px] mt-2" aria-live="polite">{error}</p>}
      <div className="mt-6 flex gap-2.5">
        <Button variant="soft" className="flex-1" onClick={onCancel}>Cancel</Button>
        <Button variant="claret" className="flex-1" busy={busy} disabled={!matches || busy} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Sheet>
  )
}
