import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { authUrlError } from '../auth/authErrors'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Logo } from '../components/Logo'

export default function Auth() {
  const { user, signIn, signUp, signInGoogle, magicLink } = useAuth()
  const nav = useNavigate()
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [pw, setPw] = useState('')
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { if (user) nav('/trips', { replace: true }) }, [user, nav])
  useEffect(() => { const e = authUrlError(location.search, location.hash); if (e) setMsg({ text: e, err: true }) }, [])

  const wrap = (fn: () => Promise<{ error?: string } | void>, ok?: string) => async () => {
    setBusy(true); setMsg(null)
    const r = (await fn()) || {}
    setBusy(false)
    if ('error' in r && r.error) setMsg({ text: r.error, err: true })
    else if (ok) setMsg({ text: ok })
  }

  return (
    <div className="min-h-screen bg-base text-ink grid place-items-center p-5">
      <div className="w-full max-w-sm bg-raised border border-hair rounded-card p-7 shadow-soft">
        <Logo className="mb-1" />
        <p className="text-muted text-[13px] mb-5">Sign in to see your trips.</p>
        <div className="space-y-2.5">
          <Input placeholder="Your name (for new accounts)" autoComplete="name" value={name} onChange={e => setName(e.target.value)} />
          <Input placeholder="Email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} />
          <Input placeholder="Password" type="password" autoComplete="current-password" value={pw} onChange={e => setPw(e.target.value)} />
        </div>
        <div className="mt-4 space-y-2.5">
          <Button variant="claret" busy={busy} className="w-full" onClick={wrap(() => signIn(email, pw))}>Sign in</Button>
          <Button variant="ghost" busy={busy} className="w-full"
            onClick={wrap(() => signUp(email, pw, name).then(r => r.needConfirm ? { error: undefined } : r) , 'Check your email to confirm, then come back here.')}>
            Create account
          </Button>
          <Button variant="soft" className="w-full" onClick={wrap(() => signInGoogle())}>Continue with Google</Button>
        </div>
        <button className="mt-3 w-full text-center text-[13px] text-sig-link"
          onClick={wrap(() => magicLink(email), 'Magic link sent — check your email.')}>
          Email me a magic link instead
        </button>
        <div className="mt-3 min-h-[18px] text-center text-[13px]" style={{ color: msg?.err ? 'var(--sig-link)' : 'var(--muted)' }}>
          {msg?.text}
        </div>
      </div>
    </div>
  )
}
