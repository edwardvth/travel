import { Link } from 'react-router-dom'
import { Logo } from './Logo'
import { ThemeToggle } from './ThemeToggle'

export function AppShell({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-base text-ink">
      <header className="flex items-center justify-between px-5 md:px-8 py-4 border-b border-hair">
        <Link to="/trips" aria-label="Voyager home"><Logo /></Link>
        <div className="flex items-center gap-2.5"><ThemeToggle />{right}</div>
      </header>
      <main>{children}</main>
    </div>
  )
}
