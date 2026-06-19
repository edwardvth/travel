import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { Logo } from '../components/Logo'
import { Button } from '../components/ui/Button'

const HERO = 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=1600&q=80'

export default function Landing() {
  const nav = useNavigate()
  const reduce = useReducedMotion()
  const go = () => nav('/auth')
  return (
    <div className="bg-base text-ink">
      <section className="relative h-[88vh] min-h-[560px] overflow-hidden">
        <img src={HERO} alt="A temple at golden hour" className="absolute inset-0 h-full w-full object-cover object-[center_40%]" />
        <div className="absolute inset-0 bg-[rgba(6,7,12,.34)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-[rgba(6,7,12,.78)] via-transparent to-[rgba(6,7,12,.55)]" />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 70% at 50% 34%, rgba(6,7,12,.62), rgba(6,7,12,.30) 38%, transparent 64%)' }} />

        <nav className="absolute top-0 inset-x-0 z-10 flex items-center justify-between px-6 md:px-9 py-5 text-white">
          <Logo />
          <div className="flex items-center gap-6 text-[14px]">
            <button onClick={go} className="hidden sm:block">Sign in</button>
            <Button variant="primary" onClick={go}>Get started</Button>
          </div>
        </nav>

        <motion.div initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="absolute z-10 top-[24%] inset-x-0 text-center px-5 text-white">
          <div className="font-mono text-[12px] tracking-[4px] uppercase text-white/85">Plan · Walk · Remember</div>
          <h1 className="font-serif font-medium text-5xl md:text-6xl tracking-tight mt-4" style={{ textShadow: '0 2px 30px rgba(0,0,0,.65)' }}>
            Every trip,<br /><span className="italic text-gold">beautifully guided.</span>
          </h1>
          <p className="mx-auto max-w-md text-[16px] text-white/90 mt-4">Plan day by day, then let it walk you through the streets — telling the story of every place as you arrive.</p>
          <form onSubmit={(e) => { e.preventDefault(); go() }}
            className="mx-auto mt-7 flex max-w-xl gap-2 rounded-full border border-white/25 bg-[rgba(20,20,26,.34)] backdrop-blur-xl p-2 pl-5">
            <input className="flex-1 bg-transparent text-[15px] text-white placeholder:text-white/70 outline-none" placeholder="Where do you want to go?" aria-label="Destination" />
            <Button variant="primary" type="submit">Start planning</Button>
          </form>
        </motion.div>
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
