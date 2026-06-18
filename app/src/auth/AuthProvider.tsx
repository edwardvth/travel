import { createContext, useEffect, useState, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface AuthState {
  user: User | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error?: string }>
  signUp: (email: string, password: string, name: string) => Promise<{ error?: string; needConfirm?: boolean }>
  signInGoogle: () => Promise<{ error?: string }>
  magicLink: (email: string) => Promise<{ error?: string }>
  signOut: () => Promise<void>
}
export const AuthContext = createContext<AuthState | null>(null)

function redirectTo() { return window.location.origin + '/auth' }

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (active) { setUser(data.session?.user ?? null); setLoading(false) }
    }).catch(() => { if (active) setLoading(false) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null); setLoading(false)
      // scrub auth tokens from the URL hash after sign-in
      if (/access_token|refresh_token|type=recovery|type=signup|type=magiclink/.test(location.hash)) {
        history.replaceState({}, '', location.pathname + location.search)
      }
    })
    return () => { active = false; sub.subscription.unsubscribe() }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    return { error: error?.message }
  }, [])

  const signUp = useCallback(async (email: string, password: string, name: string) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(), password,
      options: { emailRedirectTo: redirectTo(), data: { name: name.trim() } },
    })
    if (error) return { error: error.message }
    return { needConfirm: !data.session }
  }, [])

  const signInGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectTo(), queryParams: { prompt: 'select_account' } },
    })
    return { error: error?.message }
  }, [])

  const magicLink = useCallback(async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(), options: { emailRedirectTo: redirectTo() },
    })
    return { error: error?.message }
  }, [])

  const signOut = useCallback(async () => {
    try { await Promise.race([supabase.auth.signOut(), new Promise(r => setTimeout(r, 2500))]) } catch { /* ignore */ }
    Object.keys(localStorage).forEach(k => { if (k.startsWith('sb-')) localStorage.removeItem(k) })
    location.assign('/auth')
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signInGoogle, magicLink, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
