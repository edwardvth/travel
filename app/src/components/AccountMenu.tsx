import { useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { AccountSettings } from './AccountSettings'
import { Settings as SettingsIcon } from 'lucide-react'
import type { Profile } from '../types'

export function AccountMenu({ email, profile }: { email: string; profile: Profile | null | undefined }) {
  const { user, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const name = profile?.name || email.split('@')[0]
  const initial = name.charAt(0).toUpperCase()
  const role = profile?.role ?? 'free'
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} aria-label="Account"
        className="grid place-items-center w-9 h-9 rounded-full bg-sig-btn text-white font-bold text-[14px] cursor-pointer">{initial}</button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 z-50 w-64 bg-overlay border border-hair rounded-card p-4 shadow-lift">
            <div className="font-semibold">{name}</div>
            <div className="text-muted text-[13px]">{email}</div>
            <div className="text-muted text-[12px] mt-0.5">
              {role}{role !== 'founder' && profile?.credits != null ? ` · ${profile.credits} credits` : ''}
            </div>
            <div className="h-px bg-hair my-3.5" />
            <button
              onClick={() => { setOpen(false); setSettingsOpen(true) }}
              className="flex items-center gap-2.5 w-full text-left text-[14px] font-semibold min-h-[44px] -my-2 cursor-pointer text-ink hover:text-sig-link transition-colors"
            >
              <SettingsIcon size={17} aria-hidden="true" /> Settings
            </button>
            <div className="h-px bg-hair my-1" />
            <button
              onClick={signOut}
              className="w-full text-left text-[14px] font-semibold text-sig-link min-h-[44px] -mb-2 cursor-pointer"
            >
              Sign out
            </button>
          </div>
        </>
      )}
      <AccountSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} userId={user?.id} />
    </div>
  )
}
