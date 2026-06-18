import { useEffect, useState } from 'react'

type Theme = 'dark' | 'light'
function getInitial(): Theme {
  const saved = localStorage.getItem('voyager-theme') as Theme | null
  if (saved) return saved
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}
export function applyTheme(t: Theme) {
  const el = document.documentElement
  el.classList.remove('dark', 'light'); el.classList.add(t)
  localStorage.setItem('voyager-theme', t)
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getInitial)
  useEffect(() => { applyTheme(theme) }, [theme])
  return (
    <button
      type="button"
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="grid place-items-center w-9 h-9 rounded-btn border border-hair text-muted hover:text-ink transition-colors"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {theme === 'dark'
          ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" /></>
          : <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />}
      </svg>
    </button>
  )
}
