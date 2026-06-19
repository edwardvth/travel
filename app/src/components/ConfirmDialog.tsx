import { Sheet } from './ui/Sheet'
import { Button } from './ui/Button'

export function ConfirmDialog({ open, title, body, confirmLabel, busy, onCancel, onConfirm }:
  { open: boolean; title: string; body: string; confirmLabel: string; busy?: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Sheet open={open} onClose={onCancel} labelledBy="confirm-title">
      <h2 id="confirm-title" className="font-serif text-2xl">{title}</h2>
      <p className="text-muted text-[14px] mt-2">{body}</p>
      <div className="mt-6 flex gap-2.5">
        <Button variant="soft" className="flex-1" onClick={onCancel}>Cancel</Button>
        <Button variant="claret" className="flex-1" busy={busy} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Sheet>
  )
}
