import { cn } from '../lib/utils'
import type { HeroMode } from './useHeroMode'

/**
 * Tasteful segmented control to switch the hero background between Cinematic
 * (film) and Explorer (globe). Glassy, sits over the hero; both options are
 * 44px tall, keyboard-focusable, and expose `aria-pressed` for the active one.
 */

export interface HeroToggleProps {
  mode: HeroMode
  onChange: (m: HeroMode) => void
  className?: string
}

interface Option {
  mode: HeroMode
  label: string
  Icon: () => JSX.Element
}

const OPTIONS: Option[] = [
  { mode: 'cinematic', label: 'Cinematic', Icon: FilmIcon },
  { mode: 'explorer', label: 'Explorer', Icon: GlobeIcon },
]

export function HeroToggle({ mode, onChange, className }: HeroToggleProps) {
  return (
    <div
      role="group"
      aria-label="Hero background mode"
      className={cn(
        'inline-flex items-center gap-1 rounded-full p-1',
        'border border-white/20 bg-[rgba(20,20,26,.34)] backdrop-blur-xl',
        'shadow-[0_8px_30px_rgba(0,0,0,.28)]',
        className,
      )}
    >
      {OPTIONS.map(({ mode: m, label, Icon }) => {
        const active = mode === m
        return (
          <button
            key={m}
            type="button"
            aria-pressed={active}
            aria-label={`${label} hero`}
            onClick={() => onChange(m)}
            className={cn(
              'inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-3.5',
              'font-sans text-[13.5px] font-semibold',
              'transition-[color,background-color,box-shadow] duration-200',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80',
              'focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
              active
                ? 'bg-sig-btn text-white shadow-[0_0_18px_rgba(156,61,58,.35)]'
                : 'text-white/75 hover:bg-white/10 hover:text-white',
            )}
          >
            <Icon />
            <span>{label}</span>
          </button>
        )
      })}
    </div>
  )
}

function FilmIcon() {
  return (
    <svg
      aria-hidden="true"
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="1.75" y="2.25" width="12.5" height="11.5" rx="1.5" />
      <path d="M5.25 2.25v11.5M10.75 2.25v11.5M1.75 6h2.5M11.75 6h2.5M1.75 10h2.5M11.75 10h2.5" />
    </svg>
  )
}

function GlobeIcon() {
  return (
    <svg
      aria-hidden="true"
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="8" cy="8" r="6.25" />
      <path d="M1.75 8h12.5M8 1.75c2 2 2 10.5 0 12.5M8 1.75c-2 2-2 10.5 0 12.5" />
    </svg>
  )
}

export default HeroToggle
