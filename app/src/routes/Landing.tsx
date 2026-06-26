import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { AnimatedLink } from '../components/ui/animated-link'
import { CinematicHero } from '../components/CinematicHero'
import { cn } from '../lib/utils'

/**
 * Calm claret pill CTA — deeper oxblood `--sig`, neutral soft shadow, medium
 * weight, no colored glow halo. Claret is an accent; keep it quiet.
 */
function ClaretPill({
  onClick,
  children,
  className,
}: {
  onClick: () => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center justify-center rounded-full bg-sig px-5 py-2.5',
        'font-sans font-medium text-[14px] text-white shadow-[0_4px_14px_rgba(0,0,0,.25)]',
        'transition-[transform,filter] duration-150 hover:brightness-110 active:translate-y-px',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
        className,
      )}
    >
      {children}
    </button>
  )
}

export default function Landing() {
  const nav = useNavigate()
  const reduce = useReducedMotion()
  const go = () => nav('/auth')
  const goSignup = () => nav('/auth?mode=signup')
  const goSignin = () => nav('/auth?mode=signin')

  return (
    <div className="bg-base text-ink">
      <CinematicHero
        className="relative h-[100svh] min-h-[600px] overflow-hidden"
        headline={<>Every trip,<br /><span className="italic text-gold whitespace-nowrap">beautifully guided.</span></>}
        subcopy="Made for travelers, by travelers"
        brightness={1.8}
        onSubmit={go}
        headerRight={
          <div className="flex items-center gap-5 md:gap-7 text-[14px] text-white">
            <span className="hidden sm:inline-flex">
              <AnimatedLink href="/auth?mode=signin" onClick={(e) => { e.preventDefault(); goSignin() }} className="text-[14px]">
                Sign in
              </AnimatedLink>
            </span>
            <ClaretPill onClick={goSignup}>Get started</ClaretPill>
          </div>
        }
      />

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
        <ClaretPill onClick={go} className="px-6 py-3 text-[14.5px]">Start planning</ClaretPill>
      </section>
    </div>
  )
}
