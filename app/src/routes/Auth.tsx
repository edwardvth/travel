import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform, useReducedMotion } from 'framer-motion'
import type { TargetAndTransition, Transition } from 'framer-motion'
import { Mail, Lock, Eye, EyeClosed, ArrowRight } from 'lucide-react'
import { useAuth } from '../auth/useAuth'
import { authUrlError } from '../auth/authErrors'
import { Input } from '../components/ui/Input'
import { Mark } from '../components/Logo'

/**
 * The Voyager sign-in screen — a cinematic, always-dark glass card (deliberately
 * theme-independent; a login splash reads as a "front door", not an app surface).
 * Ported from a generic purple/black template and re-skinned to the claret/gold
 * signature with Fraunces display type. Looping ambient motion is gated behind
 * prefers-reduced-motion per the house a11y rules.
 */
export default function Auth() {
  const { user, signIn, signUp, signInGoogle, magicLink } = useAuth()
  const nav = useNavigate()
  const reduce = useReducedMotion()

  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [focusedInput, setFocusedInput] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null)

  useEffect(() => { if (user) nav('/trips', { replace: true }) }, [user, nav])
  useEffect(() => { const e = authUrlError(location.search, location.hash); if (e) setMsg({ text: e, err: true }) }, [])

  // 3D tilt — disabled when the user prefers reduced motion.
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)
  // Spring-smoothed so even a quick tap produces a visible lean-and-settle — a
  // raw .set snaps so fast that on a tap nothing reads on screen.
  const springX = useSpring(mouseX, { stiffness: 260, damping: 18, mass: 0.6 })
  const springY = useSpring(mouseY, { stiffness: 260, damping: 18, mass: 0.6 })
  const rotateX = useTransform(springY, [-200, 200], [14, -14])
  const rotateY = useTransform(springX, [-200, 200], [-14, 14])
  const tiltFrom = (clientX: number, clientY: number, el: Element) => {
    const rect = el.getBoundingClientRect()
    mouseX.set(clientX - rect.left - rect.width / 2)
    mouseY.set(clientY - rect.top - rect.height / 2)
  }
  const resetTilt = () => { mouseX.set(0); mouseY.set(0) }
  // Pointer events unify mouse + touch + pen. Down/move tilt toward the point;
  // release/leave snap back. Mouse keeps its hover-follow (don't reset on click).
  const handlePointerTilt = (e: React.PointerEvent) => {
    if (!reduce) tiltFrom(e.clientX, e.clientY, e.currentTarget)
  }
  const handlePointerUp = (e: React.PointerEvent) => { if (e.pointerType !== 'mouse') resetTilt() }

  // Looping ambient props drop out entirely (→ static) when motion is reduced.
  const loop = (animate: TargetAndTransition, transition: Transition) => (reduce ? {} : { animate, transition })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsLoading(true); setMsg(null)
    if (mode === 'signup') {
      const r = await signUp(email, password, name)
      setIsLoading(false)
      if (r.error) setMsg({ text: r.error, err: true })
      else if (r.needConfirm) setMsg({ text: 'Check your email to confirm, then come back here.' })
      // else auto-signed-in → user effect redirects to /trips
    } else {
      const r = (await signIn(email, password)) || {}
      setIsLoading(false)
      if ('error' in r && r.error) setMsg({ text: r.error, err: true })
    }
  }

  async function handleGoogle() {
    setIsLoading(true); setMsg(null)
    const r = (await signInGoogle()) || {}
    setIsLoading(false)
    if ('error' in r && r.error) setMsg({ text: r.error, err: true })
  }

  async function handleMagicLink() {
    if (!email) { setMsg({ text: 'Enter your email first, then we’ll send a sign-in link.', err: true }); return }
    setIsLoading(true); setMsg(null)
    const r = (await magicLink(email)) || {}
    setIsLoading(false)
    if ('error' in r && r.error) setMsg({ text: r.error, err: true })
    else setMsg({ text: 'Magic link sent — check your email.' })
  }

  return (
    <div className="min-h-screen w-full bg-[#0A0A0C] relative overflow-hidden flex items-center justify-center p-5">
      {/* Claret atmosphere — the signature, in place of the template's purple */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#9C3D3A]/30 via-[#5A1F22]/40 to-black" />

      {/* Noise texture */}
      <div className="absolute inset-0 opacity-[0.035] mix-blend-soft-light"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: '200px 200px',
        }}
      />

      {/* Top claret glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[120vh] h-[55vh] rounded-b-[50%] bg-[#9C3D3A]/25 blur-[90px]" />
      <motion.div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[100vh] h-[55vh] rounded-b-full bg-[#C56A60]/20 blur-[70px]"
        {...loop({ opacity: [0.12, 0.26, 0.12], scale: [0.98, 1.02, 0.98] }, { duration: 8, repeat: Infinity, repeatType: 'mirror' })}
      />
      {/* Bottom warm-gold glow */}
      <motion.div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[90vh] h-[80vh] rounded-t-full bg-[#FFD9A8]/10 blur-[80px]"
        {...loop({ opacity: [0.18, 0.32, 0.18], scale: [1, 1.08, 1] }, { duration: 7, repeat: Infinity, repeatType: 'mirror', delay: 1 })}
      />
      <div className="absolute left-1/4 top-1/4 w-96 h-96 bg-[#9C3D3A]/10 rounded-full blur-[100px]" />
      <div className="absolute right-1/4 bottom-1/4 w-96 h-96 bg-[#FFD9A8]/[0.06] rounded-full blur-[100px]" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
        className="w-full max-w-sm relative z-10"
        style={{ perspective: 900 }}
      >
        <motion.div
          className="relative"
          style={{ rotateX, rotateY, touchAction: 'none' }}
          onPointerMove={handlePointerTilt}
          onPointerDown={handlePointerTilt}
          onPointerLeave={resetTilt}
          onPointerUp={handlePointerUp}
          onPointerCancel={resetTilt}
        >
          <div className="relative group">
            {/* Traveling light beams — warm white, gated by reduced-motion */}
            {!reduce && (
              <div className="absolute -inset-[1px] rounded-card overflow-hidden pointer-events-none">
                <motion.div className="absolute top-0 left-0 h-[2px] w-[50%] bg-gradient-to-r from-transparent via-[#FFD9A8] to-transparent opacity-70"
                  animate={{ left: ['-50%', '100%'] }}
                  transition={{ duration: 2.5, ease: 'easeInOut', repeat: Infinity, repeatDelay: 1 }} />
                <motion.div className="absolute top-0 right-0 h-[50%] w-[2px] bg-gradient-to-b from-transparent via-[#FFD9A8] to-transparent opacity-60"
                  animate={{ top: ['-50%', '100%'] }}
                  transition={{ duration: 2.5, ease: 'easeInOut', repeat: Infinity, repeatDelay: 1, delay: 0.6 }} />
                <motion.div className="absolute bottom-0 right-0 h-[2px] w-[50%] bg-gradient-to-r from-transparent via-[#FFD9A8] to-transparent opacity-70"
                  animate={{ right: ['-50%', '100%'] }}
                  transition={{ duration: 2.5, ease: 'easeInOut', repeat: Infinity, repeatDelay: 1, delay: 1.2 }} />
                <motion.div className="absolute bottom-0 left-0 h-[50%] w-[2px] bg-gradient-to-b from-transparent via-[#FFD9A8] to-transparent opacity-60"
                  animate={{ bottom: ['-50%', '100%'] }}
                  transition={{ duration: 2.5, ease: 'easeInOut', repeat: Infinity, repeatDelay: 1, delay: 1.8 }} />
              </div>
            )}

            {/* Card border sheen on hover */}
            <div className="absolute -inset-[0.5px] rounded-card bg-gradient-to-r from-white/[0.03] via-white/[0.08] to-white/[0.03] opacity-0 group-hover:opacity-80 transition-opacity duration-500" />

            {/* Glass card */}
            <div className="relative bg-[#141417]/55 backdrop-blur-xl rounded-card p-7 border border-white/[0.06] shadow-[0_2px_8px_rgba(0,0,0,.5),_0_36px_90px_-32px_rgba(0,0,0,.85)] overflow-hidden">
              {/* Subtle inner grid */}
              <div className="absolute inset-0 opacity-[0.025] pointer-events-none"
                style={{
                  backgroundImage: `linear-gradient(135deg, white 0.5px, transparent 0.5px), linear-gradient(45deg, white 0.5px, transparent 0.5px)`,
                  backgroundSize: '30px 30px',
                }}
              />

              {/* Logo + header */}
              <div className="text-center space-y-1.5 mb-6">
                <motion.div
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', duration: 0.8 }}
                  className="mx-auto w-12 h-12 rounded-full border border-[#C56A60]/30 bg-[#9C3D3A]/15 flex items-center justify-center relative overflow-hidden text-[#C56A60]"
                >
                  <Mark size={26} />
                  <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-50" />
                </motion.div>

                <motion.h1
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="font-serif text-2xl font-semibold text-[#F4F3F0] tracking-tight"
                >
                  {mode === 'signin' ? 'Welcome back' : 'Start your voyage'}
                </motion.h1>

                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.25 }}
                  className="text-white/55 text-[13px]"
                >
                  {mode === 'signin' ? 'Sign in to continue to Voyager' : 'Create your account to begin planning'}
                </motion.p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3">
                {/* Name — only when creating an account */}
                <AnimatePresence initial={false}>
                  {mode === 'signup' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <Input
                        aria-label="Your name"
                        placeholder="Your name"
                        autoComplete="name"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        className="bg-white/[0.04] border-white/10 focus:border-[#C56A60] text-white placeholder:text-white/30 h-11"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Email */}
                <div className="relative flex items-center">
                  <Mail className={`absolute left-3.5 w-4 h-4 transition-colors duration-300 ${focusedInput === 'email' ? 'text-[#C56A60]' : 'text-white/40'}`} />
                  <Input
                    type="email"
                    aria-label="Email address"
                    placeholder="Email address"
                    autoComplete="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    onFocus={() => setFocusedInput('email')}
                    onBlur={() => setFocusedInput(null)}
                    className="bg-white/[0.04] border-white/10 focus:border-[#C56A60] text-white placeholder:text-white/30 h-11 pl-10"
                  />
                </div>

                {/* Password */}
                <div className="relative flex items-center">
                  <Lock className={`absolute left-3.5 w-4 h-4 transition-colors duration-300 ${focusedInput === 'password' ? 'text-[#C56A60]' : 'text-white/40'}`} />
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    aria-label="Password"
                    placeholder="Password"
                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onFocus={() => setFocusedInput('password')}
                    onBlur={() => setFocusedInput(null)}
                    className="bg-white/[0.04] border-white/10 focus:border-[#C56A60] text-white placeholder:text-white/30 h-11 pl-10 pr-10"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword(s => !s)}
                    className="absolute right-3.5 text-white/40 hover:text-white transition-colors"
                  >
                    {showPassword ? <Eye className="w-4 h-4" /> : <EyeClosed className="w-4 h-4" />}
                  </button>
                </div>

                {/* Remember me + magic link */}
                <div className="flex items-center justify-between pt-0.5">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <span className="relative inline-flex">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={() => setRememberMe(r => !r)}
                        className="appearance-none h-4 w-4 rounded border border-white/20 bg-white/5 checked:bg-[#B0473F] checked:border-[#B0473F] focus:outline-none focus:ring-1 focus:ring-[#C56A60]/40 transition-all"
                      />
                      {rememberMe && (
                        <svg className="absolute inset-0 m-auto pointer-events-none" xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </span>
                    <span className="text-xs text-white/55">Remember me</span>
                  </label>
                  <button type="button" onClick={handleMagicLink}
                    className="text-xs text-white/55 hover:text-[#C56A60] transition-colors disabled:opacity-50"
                    disabled={isLoading}>
                    Forgot password?
                  </button>
                </div>

                {/* Submit */}
                <motion.button
                  whileHover={reduce ? undefined : { scale: 1.02 }}
                  whileTap={reduce ? undefined : { scale: 0.98 }}
                  type="submit"
                  disabled={isLoading}
                  className="w-full relative group/button mt-4 disabled:opacity-70"
                >
                  <div className="absolute inset-0 bg-[#B0473F]/40 rounded-btn blur-lg opacity-0 group-hover/button:opacity-80 transition-opacity duration-300" />
                  <div className="relative overflow-hidden bg-[#B0473F] hover:brightness-110 text-white font-bold h-11 rounded-btn transition-all duration-300 flex items-center justify-center">
                    <AnimatePresence mode="wait">
                      {isLoading ? (
                        <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                          <div className="w-4 h-4 border-2 border-white/70 border-t-transparent rounded-full animate-spin" />
                        </motion.div>
                      ) : (
                        <motion.span key="label" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                          className="flex items-center justify-center gap-1.5 text-sm">
                          {mode === 'signin' ? 'Sign in' : 'Create account'}
                          <ArrowRight className="w-3.5 h-3.5 group-hover/button:translate-x-1 transition-transform duration-300" />
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.button>

                {/* Divider */}
                <div className="relative my-3 flex items-center">
                  <div className="flex-grow border-t border-white/10" />
                  <span className="mx-3 text-xs text-white/40">or</span>
                  <div className="flex-grow border-t border-white/10" />
                </div>

                {/* Google */}
                <motion.button
                  whileHover={reduce ? undefined : { scale: 1.02 }}
                  whileTap={reduce ? undefined : { scale: 0.98 }}
                  type="button"
                  onClick={handleGoogle}
                  disabled={isLoading}
                  className="w-full relative overflow-hidden bg-white/[0.04] text-white/80 hover:text-white h-11 rounded-btn border border-white/10 hover:border-white/20 transition-all duration-300 flex items-center justify-center gap-2.5 disabled:opacity-60"
                >
                  <GoogleIcon />
                  <span className="text-[13px]">Continue with Google</span>
                </motion.button>

                {/* Mode toggle */}
                <p className="text-center text-xs text-white/55 mt-4">
                  {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}{' '}
                  <button type="button"
                    onClick={() => { setMode(m => (m === 'signin' ? 'signup' : 'signin')); setMsg(null) }}
                    className="relative inline-block group/toggle font-medium text-[#F4F3F0]">
                    <span className="relative z-10 group-hover/toggle:text-[#C56A60] transition-colors">
                      {mode === 'signin' ? 'Sign up' : 'Sign in'}
                    </span>
                    <span className="absolute bottom-0 left-0 w-0 h-px bg-[#C56A60] group-hover/toggle:w-full transition-all duration-300" />
                  </button>
                </p>

                {/* Status */}
                <div aria-live="polite" className="min-h-[18px] text-center text-[13px] pt-1"
                  style={{ color: msg?.err ? 'var(--sig-link)' : 'rgba(255,255,255,.6)' }}>
                  {msg?.text}
                </div>
              </form>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.5 29.5 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.3-.3-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.5 29.5 4.5 24 4.5 16.3 4.5 9.7 8.9 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 43.5c5.4 0 10.3-2.1 14-5.4l-6.5-5.5c-2 1.5-4.6 2.4-7.5 2.4-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.6 39 16.2 43.5 24 43.5z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.5 5.5C41.4 36.6 43.5 30.9 43.5 24c0-1.2-.1-2.3-.3-3.5z" />
    </svg>
  )
}
