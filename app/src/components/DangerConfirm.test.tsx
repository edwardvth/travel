// app/src/components/DangerConfirm.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { DangerConfirm } from './DangerConfirm'

function setup(props = {}) {
  const onConfirm = vi.fn(), onCancel = vi.fn()
  render(<DangerConfirm open title="Delete account" body="This cannot be undone."
    confirmWord="DELETE" confirmLabel="Delete account" onConfirm={onConfirm} onCancel={onCancel} {...props} />)
  return { onConfirm, onCancel }
}

describe('DangerConfirm', () => {
  it('disables confirm until the word matches exactly', () => {
    const { onConfirm } = setup()
    const btn = screen.getByRole('button', { name: /delete account/i })
    expect(btn).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/type delete/i), { target: { value: 'delete' } })
    expect(btn).toBeDisabled()                       // case-sensitive
    fireEvent.change(screen.getByLabelText(/type delete/i), { target: { value: 'DELETE' } })
    expect(btn).toBeEnabled()
    fireEvent.click(btn)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('cancel fires onCancel', () => {
    const { onCancel } = setup()
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalled()
  })
})
