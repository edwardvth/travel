import { createContext, useEffect, useState, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { getAuthRedirectTo } from './redirect'
import { requestAccountDeletion } from './deleteAccount'

interface AuthState {
  user: User | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error?: string }>
  signUp: (email: string, password: string, name: string) => Promise<{ error?: string; needConfirm?: boolean }>
  signInGoogle: () => Promise<{ error?: string }>
  signInApple: () => Promise<{ error?: string }>
  magicLink: (email: string) => Promise<{ error?: string }>
  signOut: () => Promise<void>
  deleteAccount: () => Promise<import('./deleteAccount').DeleteAccountResult>
}
export const AuthContext = createContext<AuthState | null>(null)

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
      options: { emailRedirectTo: getAuthRedirectTo(), data: { name: name.trim() } },
    })
    if (error) return { error: error.message }
    return { needConfirm: !data.session }
  }, [])

  const signInGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: getAuthRedirectTo(), queryParams: { prompt: 'select_account' } },
    })
    return { error: error?.message }
  }, [])

  // Sign in with Apple — required by Guideline 4.8 because we offer Google. This is
  // the web OAuth flow (works in the browser AND inside the Capacitor WebView, and is
  // the permanent desktop path). Phase C/C4 adds the native Apple sheet on iOS, with
  // `signInApple` switching by platform; the redirect target already adapts via B1.5.
  const signInApple = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo: getAuthRedirectTo() },
    })
    return { error: error?.message }
  }, [])

  const magicLink = useCallback(async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(), options: { emailRedirectTo: getAuthRedirectTo() },
    })
    return { error: error?.message }
  }, [])

  const signOut = useCallback(async () => {
    try { await Promise.race([supabase.auth.signOut(), new Promise(r => setTimeout(r, 2500))]) } catch { /* ignore */ }
    Object.keys(localStorage).forEach(k => { if (k.startsWith('sb-')) localStorage.removeItem(k) })
    location.assign('/auth')
  }, [])

  // Delete the account, then reuse the signOut teardown on success but land on the
  // public landing ('/') rather than '/auth'. On failure, return the result so the
  // UI can show the (possibly retryable) error and keep the user signed in.
  const deleteAccount = useCallback(async () => {
    const r = await requestAccountDeletion()
    if (r.ok) {
      Object.keys(localStorage).forEach(k => { if (k.startsWith('sb-')) localStorage.removeItem(k) })
      location.assign('/')
    }
    return r
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signInGoogle, signInApple, magicLink, signOut, deleteAccount }}>
      {children}
    </AuthContext.Provider>
  )
}
