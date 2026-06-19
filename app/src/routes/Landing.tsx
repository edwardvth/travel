import { Suspense, lazy, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { Logo } from '../components/Logo'
import { Button } from '../components/ui/Button'
import { useHeroMode } from '../hero/useHeroMode'
import { HeroSearchPill } from '../hero/HeroSearchPill'
import { HeroToggle } from '../hero/HeroToggle'
import { HeroMicroDetails } from '../hero/HeroMicroDetails'

// Code-split the heavy hero backgrounds (video controller / canvas map) so the
// initial bundle stays lean (spec §11). Each becomes its own chunk; only the
// active mode is fetched.
const HeroModeCinematic = lazy(() => import('../hero/HeroModeCinematic'))
const HeroModeExplorer = lazy(() => import('../hero/HeroModeExplorer'))

/** Poster-colored placeholder shown while a hero background chunk loads. */
function HeroBackgroundFallback() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0"
      style={{ background: 'linear-gradient(160deg, #11131c 0%, #070810 100%)' }}
    />
  )
}

export default function Landing() {
  const nav = useNavigate()
  const reduce = useReducedMotion()
  const go = () => nav('/auth')

  const [mode, setMode] = useHeroMode()
  const [activeTerm, setActiveTerm] = useState('')

  return (
    <div className="bg-base text-ink">
      <section className="relative h-[88vh] min-h-[560px] overflow-hidden">
        {/* Background by mode (lazy, code-split). Each provides its own scrims. */}
        <Suspense fallback={<HeroBackgroundFallback />}>
          {mode === 'cinematic' ? (
            <HeroModeCinematic className="absolute inset-0" />
          ) : (
            <HeroModeExplorer activeTerm={activeTerm} className="absolute inset-0" />
          )}
        </Suspense>

        <nav className="absolute top-0 inset-x-0 z-10 flex items-center justify-between px-6 md:px-9 py-5 text-white">
          <Logo />
          <div className="flex items-center gap-6 text-[14px]">
            <button onClick={go} className="hidden sm:block">Sign in</button>
            <Button variant="primary" onClick={go}>Get started</Button>
          </div>
        </nav>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="absolute z-10 top-[24%] inset-x-0 text-center px-5 text-white"
        >
          <div className="font-mono text-[12px] tracking-[4px] uppercase text-white/85">Plan · Walk · Remember</div>
          <h1 className="font-serif font-medium text-5xl md:text-6xl tracking-tight mt-4" style={{ textShadow: '0 2px 30px rgba(0,0,0,.65)' }}>
            Every trip,<br /><span className="italic text-gold">beautifully guided.</span>
          </h1>
          <p className="mx-auto max-w-md text-[16px] text-white/90 mt-4">Plan day by day, then let it walk you through the streets — telling the story of every place as you arrive.</p>

          <HeroSearchPill
            onSubmit={() => go()}
            onTermChange={setActiveTerm}
            className="mt-7"
          />
          <HeroMicroDetails activeTerm={activeTerm} />
        </motion.div>

        {/* Mode toggle — glassy, tucked bottom-right, unobtrusive. */}
        <div className="absolute z-10 bottom-5 right-5 md:bottom-6 md:right-6">
          <HeroToggle mode={mode} onChange={setMode} />
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 py-20 grid gap-10 md:grid-cols-3">
        {[
          { k: 'Plan', d: 'Build each day with smart suggestions — places, times, and notes that just work.' },
          { k: 'Walk', d: 'A calm live guide narrates each landmark as you approach it, hands-free.' },
          { k: 'Remember', d: 'Turn the trip into a beautiful story you’ll actually want to share.' },
        ].map((b, i) => (
          <motion.div key={b.k} initial={reduce ? false : { opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            transition={{ duration: 0.4, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}>
            <div className="font-serif text-2xl">{b.k}</div>
            <p className="text-muted text-[14px] mt-2 leading-relaxed">{b.d}</p>
          </motion.div>
        ))}
      </section>

      <section className="text-center pb-24 px-6">
        <Button variant="claret" onClick={go}>Start planning</Button>
      </section>
    </div>
  )
}
