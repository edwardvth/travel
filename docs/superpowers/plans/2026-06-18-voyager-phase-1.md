# Voyager Phase 1 (Foundation + Landing/Auth/Dashboard) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a new Vite + React + TypeScript front end with the Voyager design-token system and ship the first three surfaces — Landing, Auth, Dashboard — reusing the existing Supabase backend unchanged.

**Architecture:** A new SPA lives in `app/` and builds to `app/dist`, which becomes the Cloudflare Worker's static-asset directory. Legacy single-file pages (`Trip.html`, etc.) are copied into the build via Vite's `public/` folder so they stay reachable during migration; `worker.js` keeps routing `/<slug>` → `Trip.html` (legacy planner) and falls back to the SPA `index.html` for client routes (`/`, `/auth`, `/trips`). All data goes through `@supabase/supabase-js` wrapped in TanStack Query. No backend/schema changes.

**Tech Stack:** Vite, React 18, TypeScript, Tailwind CSS, CSS-variable theming (dark+light), Vitest + React Testing Library, TanStack Query, React Router, Framer Motion, shadcn/ui + 21st.dev Magic MCP, Cloudflare Workers (static assets) + PWA service worker.

**Source-of-truth references (read before building):**
- Vision spec: `docs/superpowers/specs/2026-06-18-voyager-redesign-design.md`
- Build tracker (Definition of Done, Phase Gate, Build Priority, acceptance criteria): `docs/IMPLEMENTATION.md`
- Visual contract (exact look): `docs/design/Voyager Identity Board (standalone).html` and the approved mockups in `.superpowers/brainstorm/5545-1781812780/content/` (`desktop-views.html`, `landing-v2.html`, `components-redone.html`, `design-system.html`, `warm-signature.html`).
- Behavioral source for ported logic: existing `index.html` (auth, trips list, create/delete, sharing).

**Build Priority (from IMPLEMENTATION.md):** correct behavior → correct UX → correct visuals → animation polish → performance. Never trade functionality for polish. Run the anti-slop + Competitive Rule review on each screen before marking done.

---

## File Structure

```
app/
  package.json
  vite.config.ts
  tsconfig.json  tsconfig.node.json
  tailwind.config.ts  postcss.config.js
  index.html                       SPA entry
  .env.local                       VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
  public/                          copied verbatim into dist
    Trip.html TripApp.html PhotoRecovery.html push_data.html
    sw.js _headers sync_london2026.json
  src/
    main.tsx                       mount + providers
    App.tsx                        router
    index.css                      Tailwind layers + token CSS variables + @font-face
    vite-env.d.ts
    types.ts                       Trip, Profile, Stop, Day, TripConfig, TripData
    lib/
      supabase.ts                  client + env
      queryClient.ts               TanStack QueryClient
      utils.ts                     cn(), date/slug/profanity helpers
    auth/
      AuthProvider.tsx             session context + auth actions
      useAuth.ts                   hook
      authErrors.ts                pure helpers (URL error, message mapping)
    data/
      useProfile.ts
      useTrips.ts                  list + split + create + delete
      useSharing.ts                invite link + email invite + members
    components/
      ui/                          shadcn primitives (button, input, sheet, dialog, skeleton, toast, segmented)
      Logo.tsx  ThemeToggle.tsx  AppShell.tsx
      TripCard.tsx  TripRow.tsx  EmptyState.tsx
    routes/
      Landing.tsx  Auth.tsx  Dashboard.tsx
      NewTripSheet.tsx  ShareSheet.tsx
    test/setup.ts
```

---

## Task 1: Scaffold the Vite app

**Files:**
- Create: `app/package.json`, `app/vite.config.ts`, `app/tsconfig.json`, `app/tsconfig.node.json`, `app/index.html`, `app/src/main.tsx`, `app/src/App.tsx`, `app/src/vite-env.d.ts`

- [ ] **Step 1: Create the Vite project files**

`app/package.json`:
```json
{
  "name": "voyager",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0",
    "@tanstack/react-query": "^5.51.0",
    "framer-motion": "^11.3.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.6",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.2",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.19",
    "jsdom": "^24.1.0",
    "postcss": "^8.4.39",
    "tailwindcss": "^3.4.6",
    "typescript": "^5.5.3",
    "vite": "^5.3.4",
    "vitest": "^2.0.3"
  }
}
```

`app/vite.config.ts`:
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
} as any)
```

`app/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020", "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"], "module": "ESNext",
    "skipLibCheck": true, "moduleResolution": "bundler",
    "allowImportingTsExtensions": true, "resolveJsonModule": true,
    "isolatedModules": true, "noEmit": true, "jsx": "react-jsx",
    "strict": true, "noUnusedLocals": true, "noUnusedParameters": true,
    "baseUrl": ".", "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

`app/tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "composite": true, "skipLibCheck": true, "module": "ESNext",
    "moduleResolution": "bundler", "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

`app/index.html`:
```html
<!doctype html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#0A0A0C" />
    <title>Voyager</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`app/src/vite-env.d.ts`:
```ts
/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
}
interface ImportMeta { readonly env: ImportMetaEnv }
```

`app/src/App.tsx` (temporary, replaced in Task 8):
```tsx
export default function App() {
  return <div style={{ padding: 40 }}>Voyager boot OK</div>
}
```

`app/src/main.tsx` (temporary, expanded in Task 5/8):
```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

- [ ] **Step 2: Install dependencies**

Run: `cd app && npm install`
Expected: completes; `app/node_modules` created.

- [ ] **Step 3: Verify dev server boots**

Run: `cd app && npm run dev` (then Ctrl-C)
Expected: Vite prints a `localhost:5173` URL with no errors.

- [ ] **Step 4: Add gitignore entries and commit**

Append to repo-root `.gitignore`:
```
# node / vite app
app/node_modules/
app/dist/
app/.env.local
```

```bash
git add .gitignore app/package.json app/vite.config.ts app/tsconfig.json app/tsconfig.node.json app/index.html app/src/main.tsx app/src/App.tsx app/src/vite-env.d.ts
git commit -m "chore: scaffold Vite + React + TS app under app/"
```

---

## Task 2: Tailwind + design tokens (dark + light)

**Files:**
- Create: `app/tailwind.config.ts`, `app/postcss.config.js`, `app/src/index.css`

- [ ] **Step 1: PostCSS + Tailwind config**

`app/postcss.config.js`:
```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } }
```

`app/tailwind.config.ts` (maps every color to a CSS variable so light/dark swap with one class):
```ts
import type { Config } from 'tailwindcss'

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: 'var(--base)', raised: 'var(--raised)', overlay: 'var(--overlay)',
        ink: 'var(--ink)', muted: 'var(--muted)',
        sig: 'var(--sig)', 'sig-btn': 'var(--sig-btn)', 'sig-link': 'var(--sig-link)',
        gold: 'var(--gold)',
        hair: 'var(--hair)', 'hair-strong': 'var(--hair-strong)',
      },
      fontFamily: {
        serif: ['Fraunces', 'Georgia', 'serif'],
        sans: ['"General Sans"', '"Satoshi"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: { card: '18px', btn: '13px' },
      boxShadow: {
        soft: 'var(--shadow-soft)',
        lift: 'var(--shadow-lift)',
      },
    },
  },
  plugins: [],
} satisfies Config
```

- [ ] **Step 2: Token stylesheet with both themes**

`app/src/index.css`:
```css
@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,500&family=JetBrains+Mono:wght@500;600&display=swap');
@import url('https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700,900&f[]=general-sans@400,500,600&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;

:root, .dark {
  --base:#0A0A0C; --raised:#141417; --overlay:#1B1B20;
  --ink:#F4F3F0; --muted:#8E8E96;
  --hair:rgba(255,255,255,.10); --hair-strong:rgba(255,255,255,.16);
  --gold:#FFD9A8; --sig:#9C3D3A; --sig-btn:#B0473F; --sig-link:#C56A60;
  --shadow-soft:0 1px 2px rgba(0,0,0,.4), 0 12px 40px -12px rgba(0,0,0,.7);
  --shadow-lift:0 2px 6px rgba(0,0,0,.45), 0 30px 80px -28px rgba(0,0,0,.8);
  color-scheme: dark;
}
.light {
  --base:#FAF8F5; --raised:#FFFFFF; --overlay:#FFFFFF;
  --ink:#14141A; --muted:#6A6A72;
  --hair:rgba(20,20,26,.10); --hair-strong:rgba(20,20,26,.16);
  --gold:#A86A2A; --sig:#9C3D3A; --sig-btn:#B0473F; --sig-link:#8A2F2C;
  --shadow-soft:0 1px 2px rgba(36,28,20,.06), 0 18px 50px -20px rgba(36,28,20,.18);
  --shadow-lift:0 2px 8px rgba(36,28,20,.08), 0 36px 90px -32px rgba(36,28,20,.24);
  color-scheme: light;
}

@layer base {
  * { box-sizing: border-box; }
  body { @apply bg-base text-ink font-sans antialiased; margin: 0; }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: .001ms !important; transition-duration: .001ms !important; }
  }
}
```

- [ ] **Step 3: Import the stylesheet**

Edit `app/src/main.tsx` — add as the first import:
```tsx
import './index.css'
```

- [ ] **Step 4: Verify tokens render**

Replace `app/src/App.tsx` body temporarily with:
```tsx
export default function App() {
  return (
    <div className="min-h-screen bg-base text-ink p-10 font-sans">
      <h1 className="font-serif text-4xl">Voyager <span className="italic text-gold">tokens</span></h1>
      <p className="text-muted mt-2">If this is warm-white on near-black, dark tokens work.</p>
      <button className="mt-4 rounded-btn bg-[var(--sig-btn)] text-white px-5 py-3 font-sans font-bold">Claret button</button>
    </div>
  )
}
```
Run: `cd app && npm run dev`
Expected: near-black background, warm-white text, gold italic word, claret button. Toggle the `<html>` class from `dark` to `light` in devtools → warm-paper theme with no other change.

- [ ] **Step 5: Commit**

```bash
git add app/tailwind.config.ts app/postcss.config.js app/src/index.css app/src/main.tsx app/src/App.tsx
git commit -m "feat: Tailwind theme + Voyager design tokens (dark+light)"
```

---

## Task 3: Test harness + `cn` utility

**Files:**
- Create: `app/src/test/setup.ts`, `app/src/lib/utils.ts`, `app/src/lib/utils.test.ts`

- [ ] **Step 1: Test setup**

`app/src/test/setup.ts`:
```ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 2: Write the failing test for `cn`**

`app/src/lib/utils.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { cn } from './utils'

describe('cn', () => {
  it('joins truthy class names and drops falsy ones', () => {
    expect(cn('a', false && 'b', undefined, 'c')).toBe('a c')
  })
})
```

- [ ] **Step 3: Run it — expect failure**

Run: `cd app && npm test -- utils`
Expected: FAIL (`cn` not exported).

- [ ] **Step 4: Implement `cn`**

`app/src/lib/utils.ts`:
```ts
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
```

- [ ] **Step 5: Run — expect pass**

Run: `cd app && npm test -- utils`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/src/test/setup.ts app/src/lib/utils.ts app/src/lib/utils.test.ts
git commit -m "test: add Vitest setup and cn() utility"
```

---

## Task 4: Domain types

**Files:**
- Create: `app/src/types.ts`

- [ ] **Step 1: Define the data model (mirrors the existing Supabase JSONB shape)**

`app/src/types.ts`:
```ts
export interface Stop {
  name: string
  type?: string
  time?: string
  duration?: number
  lat?: number
  lng?: number
  address?: string
  facts?: string[]
  history?: string
  tips?: string
  image?: string
  icon?: string
  coords?: { lat: number; lng: number }
  wikiTitle?: string
  note?: string
}
export interface Day { title: string; note?: string; stops: Stop[] }
export interface TripConfig {
  title?: string; subtitle?: string; numDays?: number
  dayLabels?: string[]; dayTitles?: string[]; startDate?: string
}
export interface TripData {
  days: Day[]; completed: string[]; hotel: unknown | null; savedAt?: string
}
export interface Trip {
  id: string
  owner_id: string | null
  title: string
  subtitle: string | null
  config: TripConfig
  data: TripData
  updated_at?: string
  // client-only annotations
  _shared?: boolean
  _ownerEmail?: string | null
}
export interface Profile {
  id: string; email: string; name?: string
  role: 'free' | 'founder' | string; credits: number | null
}
```

- [ ] **Step 2: Typecheck**

Run: `cd app && npx tsc -b`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/src/types.ts
git commit -m "feat: domain types (Trip/Stop/Day/Profile)"
```

---

## Task 5: Supabase client, env, query provider

**Files:**
- Create: `app/.env.local`, `app/src/lib/supabase.ts`, `app/src/lib/queryClient.ts`
- Modify: `app/src/main.tsx`

- [ ] **Step 1: Env file (existing public anon key — already public in `index.html`)**

`app/.env.local`:
```
VITE_SUPABASE_URL=https://wnpanbjzmcsvhfyjdczv.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InducGFuYmp6bWNzdmhmeWpkY3p2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NzU4NjcsImV4cCI6MjA5MjA1MTg2N30.r3Vie2AAOfzYmLy4IRUk1s9mjkC6bDSoxAIYKfcz6jQ
```

- [ ] **Step 2: Supabase client**

`app/src/lib/supabase.ts`:
```ts
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})
export const SUPABASE_URL = url
export const SUPABASE_ANON_KEY = key
```

- [ ] **Step 3: Query client**

`app/src/lib/queryClient.ts`:
```ts
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
})
```

- [ ] **Step 4: Wrap the app with the provider**

`app/src/main.tsx`:
```tsx
import './index.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { queryClient } from './lib/queryClient'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
```

- [ ] **Step 5: Verify build still boots**

Run: `cd app && npm run dev` (Ctrl-C after it loads)
Expected: no errors; "Voyager tokens" page renders.

- [ ] **Step 6: Commit**

```bash
git add app/src/lib/supabase.ts app/src/lib/queryClient.ts app/src/main.tsx
git commit -m "feat: Supabase client + TanStack Query provider + router"
```

---

## Task 6: Ported pure helpers (dates, slug, profanity) — TDD

These mirror the exact logic in `index.html` so behavior is identical.

**Files:**
- Modify: `app/src/lib/utils.ts`
- Create: `app/src/lib/trip-helpers.ts`, `app/src/lib/trip-helpers.test.ts`

- [ ] **Step 1: Write failing tests**

`app/src/lib/trip-helpers.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { tripStart, tripEnd, isPastTrip, sanitizeSlug, isValidSlug, hasProfanity, buildNewTripPayload } from './trip-helpers'
import type { Trip } from '../types'

const mkTrip = (cfg: Partial<Trip['config']>, days = 0): Trip => ({
  id: 't', owner_id: 'o', title: 'T', subtitle: null,
  config: cfg, data: { days: Array.from({ length: days }, () => ({ title: '', stops: [] })), completed: [], hotel: null },
})

describe('trip date helpers', () => {
  it('tripStart falls back to far future when undated', () => {
    expect(tripStart(mkTrip({}))).toBe('9999-12-31')
    expect(tripStart(mkTrip({ startDate: '2026-07-01' }))).toBe('2026-07-01')
  })
  it('tripEnd adds numDays-1 to start', () => {
    expect(tripEnd(mkTrip({ startDate: '2026-07-01', numDays: 4 }))).toBe('2026-07-04')
  })
  it('isPastTrip is false for undated and for future trips', () => {
    expect(isPastTrip(mkTrip({}))).toBe(false)
    expect(isPastTrip(mkTrip({ startDate: '2999-01-01', numDays: 1 }))).toBe(false)
    expect(isPastTrip(mkTrip({ startDate: '2000-01-01', numDays: 1 }))).toBe(true)
  })
})

describe('slug + profanity', () => {
  it('sanitizes to lowercase a-z0-9_-', () => {
    expect(sanitizeSlug('Paris 2026!!')).toBe('paris2026')
  })
  it('validates slugs', () => {
    expect(isValidSlug('paris-2026')).toBe(true)
    expect(isValidSlug('bad slug')).toBe(false)
  })
  it('flags profanity', () => {
    expect(hasProfanity('shit trip')).toBe(true)
    expect(hasProfanity('kyoto')).toBe(false)
  })
})

describe('buildNewTripPayload', () => {
  it('computes numDays + day labels from a date range', () => {
    const p = buildNewTripPayload({ slug: 'kyoto', title: 'Kyoto', subtitle: '', start: '2026-06-30', end: '2026-07-03' })
    expect(p.config.numDays).toBe(4)
    expect(p.config.dayLabels?.[0]).toBe('Jun 30')
    expect(p.data.days).toHaveLength(4)
    expect(p.id).toBe('kyoto')
  })
  it('defaults to 4 undated days when no range', () => {
    const p = buildNewTripPayload({ slug: 'x', title: 'X', subtitle: '', start: '', end: '' })
    expect(p.config.numDays).toBe(4)
    expect(p.config.dayLabels?.[0]).toBe('Day 1')
  })
})
```

- [ ] **Step 2: Run — expect failure**

Run: `cd app && npm test -- trip-helpers`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement helpers (ported from `index.html`)**

`app/src/lib/trip-helpers.ts`:
```ts
import type { Trip, TripConfig, TripData } from '../types'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const PROFANITY = /(fuck|shit|bitch|cunt|nigg|faggot|whore|slut|porn|rape|asshole|retard|kike|chink|wetback|beaner|tranny|twat|jizz|dildo|blowjob|handjob|hitler)/i

export function tripStart(t: Trip): string { return t.config?.startDate || '9999-12-31' }

export function tripEnd(t: Trip): string {
  const sd = t.config?.startDate
  if (!sd) return '9999-12-31'
  const n = t.config?.numDays || t.data?.days?.length || 1
  const d = new Date(sd + 'T12:00:00')
  d.setDate(d.getDate() + Math.max(0, n - 1))
  return d.toISOString().slice(0, 10)
}

export function isPastTrip(t: Trip): boolean {
  return tripEnd(t) < new Date().toISOString().slice(0, 10)
}

export function byTripDate(a: Trip, b: Trip): number {
  const d = tripStart(a).localeCompare(tripStart(b))
  return d !== 0 ? d : (b.updated_at || '').localeCompare(a.updated_at || '')
}

export function sanitizeSlug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9_-]/g, '')
}
export function isValidSlug(s: string): boolean { return /^[a-z0-9-]+$/i.test(s) }
export function hasProfanity(...vals: string[]): boolean { return vals.some(v => PROFANITY.test(v)) }

export interface NewTripInput { slug: string; title: string; subtitle: string; start: string; end: string }
export interface NewTripPayload { id: string; title: string; subtitle: string; config: TripConfig; data: TripData }

export function buildNewTripPayload(input: NewTripInput): NewTripPayload {
  const { slug, title, subtitle, start, end } = input
  let numDays = 4
  const dayLabels: string[] = []
  const dayTitles: string[] = []
  if (start && end) {
    const [sy, smo, sd] = start.split('-').map(Number)
    const [ey, emo, ed] = end.split('-').map(Number)
    numDays = Math.max(1, Math.round((+new Date(ey, emo - 1, ed) - +new Date(sy, smo - 1, sd)) / 86_400_000) + 1)
    for (let i = 0; i < numDays; i++) {
      const dt = new Date(sy, smo - 1, sd + i)
      const lbl = MONTHS[dt.getMonth()] + ' ' + dt.getDate()
      dayLabels.push(lbl); dayTitles.push(lbl + ' · Day ' + (i + 1))
    }
  } else {
    for (let i = 0; i < numDays; i++) { dayLabels.push('Day ' + (i + 1)); dayTitles.push('Day ' + (i + 1)) }
  }
  const days = dayLabels.map((_, i) => ({ title: dayTitles[i], note: '', stops: [] }))
  return {
    id: slug, title, subtitle,
    config: { title, subtitle, numDays, dayLabels, dayTitles, startDate: start || '' },
    data: { days, completed: [], hotel: null, savedAt: new Date().toISOString() },
  }
}

export function formatDateRange(t: Trip): string {
  const labels = t.config?.dayLabels || []
  const n = t.config?.numDays || t.data?.days?.length || 0
  return labels.length >= 2 ? `${labels[0]} – ${labels[labels.length - 1]}` : `${n} days`
}
```

- [ ] **Step 4: Run — expect pass**

Run: `cd app && npm test -- trip-helpers`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/trip-helpers.ts app/src/lib/trip-helpers.test.ts
git commit -m "feat: port trip date/slug/profanity/payload helpers (TDD)"
```

---

## Task 7: Logo, ThemeToggle

**Files:**
- Create: `app/src/components/Logo.tsx`, `app/src/components/ThemeToggle.tsx`, `app/public/favicon.svg`
- Create: `app/src/components/Logo.test.tsx`

- [ ] **Step 1: Logo component (real backpack-traveler mark, claret via currentColor)**

`app/src/components/Logo.tsx`:
```tsx
export function Mark({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" fill="none" stroke="currentColor"
      strokeWidth="4.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="16.5" y="10.8" width="8" height="12.6" rx="3" transform="rotate(-14 20.5 17.1)" fill="currentColor" stroke="none" />
      <circle cx="27.2" cy="8.6" r="3.3" fill="currentColor" stroke="none" />
      <path d="M26 12.2 L21.8 24.6" />
      <path d="M24.6 14.8 L30 20.2" strokeWidth="4.2" />
      <path d="M21.8 24.6 L26.4 38" />
      <path d="M21.8 24.6 L15.8 36.4" />
    </svg>
  )
}

export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-sans font-extrabold tracking-tight ${className}`}>
      <span className="text-sig-link"><Mark size={26} /></span>
      <span className="text-[17px]">Voyager</span>
    </span>
  )
}
```

`app/public/favicon.svg` (claret on transparent — copy of `docs/design/voyager-mark.svg`, with explicit stroke color):
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 44" fill="none" stroke="#B0473F" stroke-width="4.7" stroke-linecap="round" stroke-linejoin="round"><rect x="16.5" y="10.8" width="8" height="12.6" rx="3" transform="rotate(-14 20.5 17.1)" fill="#B0473F" stroke="none"></rect><circle cx="27.2" cy="8.6" r="3.3" fill="#B0473F" stroke="none"></circle><path d="M26 12.2 L21.8 24.6"></path><path d="M24.6 14.8 L30 20.2" stroke-width="4.2"></path><path d="M21.8 24.6 L26.4 38"></path><path d="M21.8 24.6 L15.8 36.4"></path></svg>
```

- [ ] **Step 2: ThemeToggle (persists to localStorage, toggles `<html>` class)**

`app/src/components/ThemeToggle.tsx`:
```tsx
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
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {theme === 'dark'
          ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" /></>
          : <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />}
      </svg>
    </button>
  )
}
```

- [ ] **Step 3: Logo render test**

`app/src/components/Logo.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Logo } from './Logo'

describe('Logo', () => {
  it('renders the Voyager wordmark', () => {
    render(<Logo />)
    expect(screen.getByText('Voyager')).toBeInTheDocument()
  })
})
```

- [ ] **Step 4: Run test**

Run: `cd app && npm test -- Logo`
Expected: PASS.

- [ ] **Step 5: Copy favicon + commit**

```bash
git add app/src/components/Logo.tsx app/src/components/Logo.test.tsx app/src/components/ThemeToggle.tsx app/public/favicon.svg
git commit -m "feat: Voyager logo (backpack mark) + theme toggle"
```

---

## Task 8: Router shell + legacy coexistence + deploy wiring

**Files:**
- Modify: `app/src/App.tsx`
- Create: `app/src/components/AppShell.tsx`
- Copy into `app/public/`: `Trip.html TripApp.html PhotoRecovery.html push_data.html sw.js _headers sync_london2026.json`
- Modify (repo root): `wrangler.jsonc`, `worker.js`
- Create (repo root): `app/public/_redirects` (SPA fallback for the static-asset router)

- [ ] **Step 1: AppShell (top nav used by Dashboard; Landing/Auth render their own)**

`app/src/components/AppShell.tsx`:
```tsx
import { Link } from 'react-router-dom'
import { Logo } from './Logo'
import { ThemeToggle } from './ThemeToggle'

export function AppShell({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-base text-ink">
      <header className="flex items-center justify-between px-5 md:px-8 py-4 border-b border-hair">
        <Link to="/trips" aria-label="Voyager home"><Logo /></Link>
        <div className="flex items-center gap-3">{right}<ThemeToggle /></div>
      </header>
      <main>{children}</main>
    </div>
  )
}
```

- [ ] **Step 2: Router with the Phase-1 routes (real components wired in later tasks)**

`app/src/App.tsx`:
```tsx
import { Routes, Route, Navigate } from 'react-router-dom'
import Landing from './routes/Landing'
import Auth from './routes/Auth'
import Dashboard from './routes/Dashboard'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/trips" element={<Dashboard />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
```

- [ ] **Step 3: Create placeholder route files so the app compiles (replaced in later tasks)**

`app/src/routes/Landing.tsx`, `app/src/routes/Auth.tsx`, `app/src/routes/Dashboard.tsx` — each:
```tsx
export default function Page() { return <div className="p-10 text-ink bg-base min-h-screen">stub</div> }
```
(Use the same default-export stub in all three for now.)

- [ ] **Step 4: Copy legacy static pages into the build's public folder**

Run:
```bash
cd ~/travel && cp Trip.html TripApp.html PhotoRecovery.html push_data.html sw.js _headers sync_london2026.json app/public/
```
Expected: those files now exist under `app/public/`.

- [ ] **Step 5: SPA fallback for the static asset router**

`app/public/_redirects`:
```
/trip/*   /index.html   200
/auth     /index.html   200
/trips    /index.html   200
```

- [ ] **Step 6: Point the Worker at the built SPA and keep legacy slug routing**

`wrangler.jsonc` — change the assets directory:
```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "travel",
  "compatibility_date": "2026-06-11",
  "main": "worker.js",
  "observability": { "enabled": true },
  "assets": { "directory": "app/dist", "binding": "ASSETS" },
  "compatibility_flags": ["nodejs_compat"]
}
```

`worker.js` — fall back to the SPA shell for non-asset routes; keep `/<slug>` → legacy Trip.html:
```js
// Pretty URLs: travel-guide.ai/london2026 → /Trip.html?trip=london2026 (legacy planner, until Phase 2)
// SPA client routes (/, /auth, /trips, /trip/*) fall back to the Vite index.html.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const slug = url.pathname.match(/^\/([A-Za-z0-9_-]+)\/?$/);
    const reserved = new Set(['auth', 'trips', 'trip']);
    if (slug && !slug[1].includes('.') && !reserved.has(slug[1].toLowerCase())) {
      const dest = new URL('/Trip.html', url.origin);
      dest.searchParams.set('trip', slug[1].toLowerCase());
      url.searchParams.forEach((v, k) => { if (k !== 'trip') dest.searchParams.set(k, v); });
      return Response.redirect(dest.toString(), 302);
    }
    return env.ASSETS.fetch(new URL('/index.html', url.origin));
  }
};
```

- [ ] **Step 7: Build and verify output contains both SPA and legacy files**

Run: `cd app && npm run build`
Expected: `app/dist/index.html` exists AND `app/dist/Trip.html`, `app/dist/sw.js` exist (copied from `public/`).

- [ ] **Step 8: Commit**

```bash
cd ~/travel
git add app/src/App.tsx app/src/components/AppShell.tsx app/src/routes app/public wrangler.jsonc worker.js
git commit -m "feat: router shell + legacy HTML coexistence + Worker SPA fallback"
```

---

## Task 9: shadcn-style UI primitives (themed to tokens) + 21st.dev MCP

> Use the **21st.dev Magic MCP** (connect it now) and **shadcn/ui** to pull each primitive,
> then re-theme to Voyager tokens. The components below are the themed target each pull must
> match. Keep them dependency-light (no external UI lib required).

**Files:**
- Create: `app/src/components/ui/Button.tsx`, `Input.tsx`, `Sheet.tsx`, `Skeleton.tsx`, `Segmented.tsx`
- Create: `app/src/components/ui/Button.test.tsx`

- [ ] **Step 1: Button (primary ink / claret / ghost / soft; squared r13; SVG-friendly)**

`app/src/components/ui/Button.tsx`:
```tsx
import { cn } from '../../lib/utils'

type Variant = 'primary' | 'claret' | 'ghost' | 'soft'
const styles: Record<Variant, string> = {
  primary: 'bg-ink text-base hover:shadow-lift',
  claret: 'bg-sig-btn text-white hover:brightness-110',
  ghost: 'bg-transparent text-ink border border-hair hover:bg-[rgba(255,255,255,.06)]',
  soft: 'bg-[rgba(255,255,255,.07)] text-ink hover:bg-[rgba(255,255,255,.12)]',
}
export function Button(
  { variant = 'primary', className, busy, children, ...props }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }
) {
  return (
    <button
      {...props}
      disabled={props.disabled || busy}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-btn px-5 py-3 font-sans font-bold text-[14.5px]',
        'transition-[transform,background,box-shadow] duration-150 active:translate-y-px',
        'disabled:opacity-60 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sig-link',
        styles[variant], className,
      )}
    >
      {busy ? 'Working…' : children}
    </button>
  )
}
```

- [ ] **Step 2: Input**

`app/src/components/ui/Input.tsx`:
```tsx
import { cn } from '../../lib/utils'
export const Input = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input
    {...props}
    className={cn(
      'w-full rounded-btn bg-[rgba(255,255,255,.04)] border border-hair px-4 py-3 text-[15px] text-ink',
      'placeholder:text-muted outline-none focus:border-sig-link transition-colors', props.className,
    )}
  />
)
```

- [ ] **Step 3: Sheet (bottom sheet on mobile, centered on desktop), Skeleton, Segmented**

`app/src/components/ui/Sheet.tsx`:
```tsx
import { cn } from '../../lib/utils'
export function Sheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className={cn('relative w-full md:max-w-lg bg-overlay border border-hair',
        'rounded-t-card md:rounded-card p-6 shadow-lift', 'max-h-[90vh] overflow-y-auto')}>
        {children}
      </div>
    </div>
  )
}
```

`app/src/components/ui/Skeleton.tsx`:
```tsx
import { cn } from '../../lib/utils'
export const Skeleton = ({ className }: { className?: string }) => (
  <div className={cn('animate-pulse rounded-md bg-[rgba(255,255,255,.07)]', className)} />
)
```

`app/src/components/ui/Segmented.tsx`:
```tsx
import { cn } from '../../lib/utils'
export function Segmented<T extends string>(
  { value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }
) {
  return (
    <div className="inline-flex p-1 rounded-btn bg-[rgba(255,255,255,.05)] border border-hair">
      {options.map(o => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn('px-4 py-2 rounded-[10px] text-[13px] font-bold transition-colors',
            value === o.value ? 'bg-sig-btn text-white' : 'text-muted hover:text-ink')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Button test**

`app/src/components/ui/Button.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { Button } from './Button'

describe('Button', () => {
  it('fires onClick and disables when busy', async () => {
    const onClick = vi.fn()
    const { rerender } = render(<Button onClick={onClick}>Go</Button>)
    await userEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledOnce()
    rerender(<Button busy onClick={onClick}>Go</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })
})
```

- [ ] **Step 5: Run test, then commit**

Run: `cd app && npm test -- Button`
Expected: PASS.
```bash
git add app/src/components/ui
git commit -m "feat: themed UI primitives (button/input/sheet/skeleton/segmented)"
```

---

## Task 10: Auth helpers (pure) — TDD

**Files:**
- Create: `app/src/auth/authErrors.ts`, `app/src/auth/authErrors.test.ts`

- [ ] **Step 1: Failing tests (ported from `index.html` authUrlError + message intent)**

`app/src/auth/authErrors.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { authUrlError } from './authErrors'

describe('authUrlError', () => {
  it('returns null with no error in the URL', () => {
    expect(authUrlError('', '')).toBeNull()
  })
  it('explains expired/used links gently', () => {
    expect(authUrlError('', 'error_description=otp+expired'))
      .toMatch(/expired or was opened/i)
  })
  it('passes through other descriptions, decoding +', () => {
    expect(authUrlError('?error_description=Email+not+confirmed', ''))
      .toBe('Email not confirmed')
  })
})
```

- [ ] **Step 2: Run — expect fail**

Run: `cd app && npm test -- authErrors`
Expected: FAIL.

- [ ] **Step 3: Implement**

`app/src/auth/authErrors.ts`:
```ts
/** Ported from index.html authUrlError(): reads error_description from search+hash. */
export function authUrlError(search: string, hash: string): string | null {
  const p = new URLSearchParams((search || '').replace(/^\?/, '') + '&' + (hash || '').replace(/^#/, ''))
  const desc = p.get('error_description')
  if (!desc) return null
  if (/state not found|expired/i.test(desc))
    return 'That link expired or was opened in a different browser. Your account is likely confirmed — just sign in below.'
  return desc.replace(/\+/g, ' ')
}
```

- [ ] **Step 4: Run — expect pass; commit**

Run: `cd app && npm test -- authErrors`
Expected: PASS.
```bash
git add app/src/auth/authErrors.ts app/src/auth/authErrors.test.ts
git commit -m "feat: auth URL-error helper (TDD, ported)"
```

---

## Task 11: AuthProvider + useAuth

**Files:**
- Create: `app/src/auth/AuthProvider.tsx`, `app/src/auth/useAuth.ts`
- Modify: `app/src/main.tsx` (wrap with `<AuthProvider>`)

- [ ] **Step 1: AuthProvider (session + all methods ported from `index.html`)**

`app/src/auth/AuthProvider.tsx`:
```tsx
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
    })
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
```

`app/src/auth/useAuth.ts`:
```ts
import { useContext } from 'react'
import { AuthContext } from './AuthProvider'
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
```

- [ ] **Step 2: Wrap the tree**

In `app/src/main.tsx`, import `AuthProvider` and wrap `<App/>` inside `<BrowserRouter>`:
```tsx
import { AuthProvider } from './auth/AuthProvider'
// ...
<BrowserRouter>
  <AuthProvider>
    <App />
  </AuthProvider>
</BrowserRouter>
```

- [ ] **Step 3: Typecheck + commit**

Run: `cd app && npx tsc -b`
Expected: no errors.
```bash
git add app/src/auth/AuthProvider.tsx app/src/auth/useAuth.ts app/src/main.tsx
git commit -m "feat: AuthProvider with ported Supabase auth methods"
```

---

## Task 12: Auth route UI

**Files:**
- Modify: `app/src/routes/Auth.tsx`

Visual reference: `index.html` auth gate (methods) re-skinned to tokens; single calm card. Copy in Voyager Voice.

- [ ] **Step 1: Build the Auth screen**

`app/src/routes/Auth.tsx`:
```tsx
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
```

- [ ] **Step 2: Manual verification**

Run: `cd app && npm run dev`, open `/auth`.
Expected: calm single card, claret "Sign in", ghost "Create account", Google, magic-link. Sign in with a real account → redirects to `/trips`. Light/dark both legible.

- [ ] **Step 3: Commit**

```bash
git add app/src/routes/Auth.tsx
git commit -m "feat: Auth screen (sign in/up/google/magic link), reskinned"
```

---

## Task 13: Profile + Trips data hooks

**Files:**
- Create: `app/src/data/useProfile.ts`, `app/src/data/useTrips.ts`
- Create: `app/src/data/useTrips.test.ts`

- [ ] **Step 1: useProfile**

`app/src/data/useProfile.ts`:
```ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types'

export function useProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ['profile', userId],
    enabled: !!userId,
    queryFn: async (): Promise<Profile | null> => {
      const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
      return (data as Profile) ?? null
    },
  })
}
export const isFounder = (p?: Profile | null) => p?.role === 'founder'
```

- [ ] **Step 2: Failing test for the split selector**

`app/src/data/useTrips.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { splitTrips } from './useTrips'
import type { Trip } from '../types'

const t = (id: string, startDate?: string, numDays = 1): Trip => ({
  id, owner_id: 'o', title: id, subtitle: null,
  config: { startDate, numDays }, data: { days: [], completed: [], hotel: null },
})

describe('splitTrips', () => {
  it('separates past from upcoming and keeps undated as upcoming', () => {
    const { upcoming, past } = splitTrips([
      t('old', '2000-01-01'), t('soon', '2999-01-01'), t('undated'),
    ])
    expect(past.map(x => x.id)).toEqual(['old'])
    expect(upcoming.map(x => x.id).sort()).toEqual(['soon', 'undated'])
  })
})
```

- [ ] **Step 3: Run — expect fail**

Run: `cd app && npm test -- useTrips`
Expected: FAIL.

- [ ] **Step 4: Implement useTrips (list + split + create + delete), ported from `index.html`**

`app/src/data/useTrips.ts`:
```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Trip, Profile } from '../types'
import { byTripDate, isPastTrip, buildNewTripPayload, type NewTripInput } from '../lib/trip-helpers'
import { isFounder } from './useProfile'

export function splitTrips(trips: Trip[]) {
  const sorted = [...trips].sort(byTripDate)
  return { upcoming: sorted.filter(t => !isPastTrip(t)), past: sorted.filter(isPastTrip) }
}

const COLS = 'id, owner_id, title, subtitle, config, data, updated_at'

export function useTrips(userId: string | undefined, profile: Profile | null | undefined) {
  return useQuery({
    queryKey: ['trips', userId, profile?.role],
    enabled: !!userId,
    queryFn: async (): Promise<Trip[]> => {
      if (isFounder(profile)) {
        const { data } = await supabase.from('trips').select(COLS).order('updated_at', { ascending: false })
        return (data as Trip[]) ?? []
      }
      const { data } = await supabase.from('trips').select(COLS)
      const all = (data as Trip[]) ?? []
      const memberIds = new Set<string>()
      const { data: mems } = await supabase.from('trip_members').select('trip_id')
      ;(mems ?? []).forEach((m: { trip_id: string }) => memberIds.add(m.trip_id))
      const mine = all
        .filter(t => (t.owner_id && t.owner_id === userId) || memberIds.has(t.id))
        .map(t => ({ ...t, _shared: !(t.owner_id && t.owner_id === userId) }))
      const sharedIds = mine.filter(t => t._shared).map(t => t.id)
      if (sharedIds.length) {
        const { data: owners } = await supabase.rpc('trip_owner_emails', { p_ids: sharedIds })
        const map: Record<string, string> = {}
        ;(owners ?? []).forEach((o: { trip_id: string; owner_email: string }) => { map[o.trip_id] = o.owner_email })
        mine.forEach(t => { if (t._shared) t._ownerEmail = map[t.id] ?? null })
      }
      return mine
    },
  })
}

export function useCreateTrip() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: NewTripInput) => {
      const p = buildNewTripPayload(input)
      const { data, error } = await supabase.rpc('create_trip', {
        p_id: p.id, p_title: p.title, p_subtitle: p.subtitle, p_config: p.config, p_data: p.data,
      })
      if (error) throw new Error(error.message)
      if (!data || data.ok !== true) throw new Error(data?.reason || 'create_failed')
      return p.id
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trips'] }),
  })
}

export function useDeleteTrip() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc('delete_trip', { p_id: id })
      if (error) throw new Error(error.message)
      if (!data || data.ok !== true) throw new Error(data?.reason || 'delete_failed')
      return id
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trips'] }),
  })
}
```

- [ ] **Step 5: Run — expect pass; commit**

Run: `cd app && npm test -- useTrips`
Expected: PASS.
```bash
git add app/src/data/useProfile.ts app/src/data/useTrips.ts app/src/data/useTrips.test.ts
git commit -m "feat: profile + trips data hooks (list/split/create/delete, TDD)"
```

---

## Task 14: TripCard, TripRow, EmptyState

**Files:**
- Create: `app/src/components/TripCard.tsx`, `app/src/components/TripRow.tsx`, `app/src/components/EmptyState.tsx`

Visual reference: `components-redone.html` (editorial card + hairline rows), `desktop-views.html` (dashboard).

- [ ] **Step 1: TripCard (editorial, full-bleed)**

`app/src/components/TripCard.tsx` (optional `actions` slot renders as a sibling overlay — never a nested button):
```tsx
import { formatDateRange } from '../lib/trip-helpers'
import type { Trip } from '../types'

export function TripCard({ trip, onOpen, actions }: { trip: Trip; onOpen: (id: string) => void; actions?: React.ReactNode }) {
  const cover = trip.data?.days?.flatMap(d => d.stops)?.find(s => s.image)?.image
  const stops = trip.data?.days?.reduce((n, d) => n + (d.stops?.length || 0), 0) ?? 0
  return (
    <div className="group relative h-[260px] w-full overflow-hidden rounded-card border border-hair">
      <button onClick={() => onOpen(trip.id)} className="absolute inset-0 text-left" aria-label={`Open ${trip.title}`}>
        {cover
          ? <img src={cover} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
          : <span className="absolute inset-0 bg-raised" />}
        <span className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent" />
        <span className="absolute left-5 right-5 bottom-4 block">
          <span className="block font-serif font-medium text-[30px] leading-none tracking-tight text-white">{trip.title}</span>
          <span className="mt-2 block font-mono text-[11px] uppercase tracking-wider text-white/75">
            {formatDateRange(trip)} · {stops} stops{trip._shared ? ` · shared by ${trip._ownerEmail ?? 'owner'}` : ''}
          </span>
        </span>
      </button>
      {actions && <div className="absolute top-3 right-3 z-10 flex gap-1.5">{actions}</div>}
    </div>
  )
}
```

- [ ] **Step 2: TripRow (dense hairline row)**

`app/src/components/TripRow.tsx`:
```tsx
import { formatDateRange } from '../lib/trip-helpers'
import type { Trip } from '../types'

export function TripRow({ trip, onOpen, actions }: { trip: Trip; onOpen: (id: string) => void; actions?: React.ReactNode }) {
  const cover = trip.data?.days?.flatMap(d => d.stops)?.find(s => s.image)?.image
  return (
    <div className="flex w-full items-center gap-3.5 p-4 border border-hair rounded-card hover:bg-[rgba(255,255,255,.03)] transition-colors">
      <button onClick={() => onOpen(trip.id)} className="flex flex-1 items-center gap-3.5 text-left min-w-0" aria-label={`Open ${trip.title}`}>
        <span className="h-[54px] w-[54px] flex-none rounded-[12px] bg-raised bg-cover bg-center"
          style={cover ? { backgroundImage: `url(${cover})` } : undefined} />
        <span className="min-w-0">
          <span className="block font-sans font-semibold text-[15.5px] truncate">{trip.title}</span>
          <span className="block font-mono text-[11px] uppercase tracking-wide text-muted">{formatDateRange(trip)}</span>
        </span>
      </button>
      {actions
        ? <div className="flex gap-1.5">{actions}</div>
        : <svg className="text-muted" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 6l6 6-6 6" strokeLinecap="round" /></svg>}
    </div>
  )
}
```

- [ ] **Step 3: EmptyState**

`app/src/components/EmptyState.tsx`:
```tsx
export function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="grid place-items-center text-center py-20 px-6">
      <h3 className="font-serif font-medium text-2xl">{title}</h3>
      <p className="text-muted text-[14px] mt-2 max-w-xs">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
```

- [ ] **Step 4: Typecheck + commit**

Run: `cd app && npx tsc -b`
Expected: no errors.
```bash
git add app/src/components/TripCard.tsx app/src/components/TripRow.tsx app/src/components/EmptyState.tsx
git commit -m "feat: TripCard (editorial) + TripRow (dense) + EmptyState"
```

---

## Task 15: NewTripSheet (2-step Where → When)

**Files:**
- Create: `app/src/routes/NewTripSheet.tsx`

- [ ] **Step 1: Build the 2-step sheet (validation uses ported helpers)**

`app/src/routes/NewTripSheet.tsx`:
```tsx
import { useState } from 'react'
import { Sheet } from '../components/ui/Sheet'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { sanitizeSlug, isValidSlug, hasProfanity } from '../lib/trip-helpers'
import { useCreateTrip } from '../data/useTrips'

const REASONS: Record<string, string> = {
  slug_taken: 'That Trip ID already exists — pick another.',
  no_credits: "You're out of trip credits. Credit packs are coming soon.",
  invalid_name: 'Please choose a different name.',
  no_profile: 'No account profile found — sign out and back in.',
}

export function NewTripSheet({ open, onClose, onCreated, isTeaser }:
  { open: boolean; onClose: () => void; onCreated: (id: string) => void; isTeaser?: boolean }) {
  const [step, setStep] = useState<1 | 2>(1)
  const [slug, setSlug] = useState(''); const [title, setTitle] = useState(''); const [subtitle, setSubtitle] = useState('')
  const [start, setStart] = useState(''); const [end, setEnd] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const create = useCreateTrip()

  const next = () => {
    if (!slug || !title) return setErr('Trip ID and title are required.')
    if (!isValidSlug(slug)) return setErr('Trip ID can only contain letters, numbers, and dashes.')
    if (hasProfanity(slug, title, subtitle)) return setErr('Please choose a different name.')
    setErr(null); setStep(2)
  }
  const submit = async () => {
    setErr(null)
    try { onCreated(await create.mutateAsync({ slug, title, subtitle, start, end })) }
    catch (e) { setErr(REASONS[(e as Error).message] ?? "Couldn't create this trip. Try again.") }
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <h2 className="font-serif text-2xl">{step === 1 ? 'Where to?' : 'When are you going?'}</h2>
      <p className="text-muted text-[13px] mt-1">{step === 1 ? "Name your trip — you'll add days next." : 'Pick your dates, or skip and set them later.'}</p>

      {step === 1 ? (
        <div className="mt-5 space-y-2.5">
          <Input placeholder="Trip ID (e.g. kyoto2026)" value={slug} onChange={e => setSlug(sanitizeSlug(e.target.value))} />
          <Input placeholder="Title (e.g. Kyoto Spring 2026)" value={title} onChange={e => setTitle(e.target.value)} />
          <Input placeholder="Subtitle (optional)" value={subtitle} onChange={e => setSubtitle(e.target.value)} />
          {isTeaser && <p className="text-[12.5px] text-sig-link">Your first trip is a free teaser — plan all your days and fill Day 1.</p>}
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          <label className="block text-[12px] font-bold uppercase tracking-wide text-muted">Start date
            <Input type="date" value={start} onChange={e => setStart(e.target.value)} className="mt-1" />
          </label>
          <label className="block text-[12px] font-bold uppercase tracking-wide text-muted">End date
            <Input type="date" value={end} onChange={e => setEnd(e.target.value)} className="mt-1" />
          </label>
          {start && end && <p className="font-mono text-[12px] text-muted">{`${start} → ${end}`}</p>}
        </div>
      )}

      {err && <p className="mt-3 text-[13px] text-sig-link">{err}</p>}

      <div className="mt-6 flex gap-2.5">
        {step === 1
          ? <><Button variant="soft" className="flex-1" onClick={onClose}>Cancel</Button>
              <Button variant="claret" className="flex-1" onClick={next}>Next</Button></>
          : <><Button variant="soft" className="flex-1" onClick={() => setStep(1)}>Back</Button>
              <Button variant="claret" className="flex-1" busy={create.isPending} onClick={submit}>Create trip</Button></>}
      </div>
    </Sheet>
  )
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `cd app && npx tsc -b`
Expected: no errors.
```bash
git add app/src/routes/NewTripSheet.tsx
git commit -m "feat: 2-step new-trip sheet (Where -> When) with ported validation"
```

---

## Task 16: ShareSheet (invite link + email invite + members)

**Files:**
- Create: `app/src/data/useSharing.ts`, `app/src/routes/ShareSheet.tsx`

- [ ] **Step 1: Sharing hooks (ported RPCs + send-invite function)**

`app/src/data/useSharing.ts`:
```ts
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../lib/supabase'

export async function createInviteLink(id: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_invite', { p_id: id })
  if (error || !data || data.ok !== true || !data.token) throw new Error('invite_failed')
  return `${location.origin}/Trip.html?trip=${id}&join=${data.token}`
}

export async function inviteByEmail(id: string, email: string): Promise<void> {
  const { data, error } = await supabase.rpc('add_trip_member', { p_id: id, p_email: email })
  if (error || !data || data.ok !== true) throw new Error(data?.reason || 'share_failed')
  try {
    const { data: sess } = await supabase.auth.getSession()
    const tok = sess.session?.access_token
    await fetch(`${SUPABASE_URL}/functions/v1/send-invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}`, apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ email, trip_id: id, link: `${location.origin}/Trip.html?trip=${id}` }),
    })
  } catch { /* email is best-effort */ }
}

export async function listMembers(id: string): Promise<string[]> {
  const { data } = await supabase.from('trip_members').select('email').eq('trip_id', id)
  return (data ?? []).map((m: { email: string }) => m.email)
}

export async function removeMember(id: string, email: string): Promise<void> {
  const { data } = await supabase.rpc('remove_trip_member', { p_id: id, p_email: email })
  if (!data || data.ok !== true) throw new Error('remove_failed')
}
```

- [ ] **Step 2: ShareSheet UI**

`app/src/routes/ShareSheet.tsx`:
```tsx
import { useEffect, useState } from 'react'
import { Sheet } from '../components/ui/Sheet'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { createInviteLink, inviteByEmail, listMembers, removeMember } from '../data/useSharing'

export function ShareSheet({ tripId, open, onClose }: { tripId: string; open: boolean; onClose: () => void }) {
  const [email, setEmail] = useState(''); const [msg, setMsg] = useState<string | null>(null)
  const [members, setMembers] = useState<string[]>([])
  useEffect(() => { if (open) listMembers(tripId).then(setMembers).catch(() => {}) }, [open, tripId])

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(await createInviteLink(tripId)); setMsg('Link copied — anyone who opens it joins the trip.') }
    catch { setMsg("Couldn't create a link. Try again.") }
  }
  const send = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setMsg('Enter a valid email address.')
    try { await inviteByEmail(tripId, email); setEmail(''); setMsg('Invited.'); setMembers(await listMembers(tripId)) }
    catch { setMsg("Couldn't share this trip. Only the owner can.") }
  }
  const remove = async (e: string) => { try { await removeMember(tripId, e); setMembers(await listMembers(tripId)) } catch { /* ignore */ } }

  return (
    <Sheet open={open} onClose={onClose}>
      <h2 className="font-serif text-2xl">Share “{tripId}”</h2>
      <Button variant="soft" className="w-full mt-4" onClick={copyLink}>Copy invite link</Button>
      <div className="my-4 flex items-center gap-3 text-muted text-[12px]"><div className="flex-1 h-px bg-hair" />or invite by email<div className="flex-1 h-px bg-hair" /></div>
      <div className="flex gap-2">
        <Input placeholder="Email address" type="email" value={email} onChange={e => setEmail(e.target.value)} />
        <Button variant="claret" onClick={send}>Send</Button>
      </div>
      {msg && <p className="mt-2 text-[12.5px] text-sig-link">{msg}</p>}
      {members.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {members.map(m => (
            <li key={m} className="flex items-center justify-between text-[13px] border-b border-hair pb-1.5">
              <span>{m}</span>
              <button className="text-sig-link text-[12px]" onClick={() => remove(m)}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      <Button variant="soft" className="w-full mt-5" onClick={onClose}>Done</Button>
    </Sheet>
  )
}
```

- [ ] **Step 3: Typecheck + commit**

Run: `cd app && npx tsc -b`
Expected: no errors.
```bash
git add app/src/data/useSharing.ts app/src/routes/ShareSheet.tsx
git commit -m "feat: ShareSheet (invite link + email invite + member management)"
```

---

## Task 17: Dashboard route

**Files:**
- Modify: `app/src/routes/Dashboard.tsx`

Visual reference: `desktop-views.html` (dashboard section). Greeting leads with intent (companion voice).

- [ ] **Step 1: Build the Dashboard**

`app/src/routes/Dashboard.tsx`:
```tsx
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { useProfile } from '../data/useProfile'
import { useTrips, splitTrips } from '../data/useTrips'
import { AppShell } from '../components/AppShell'
import { Button } from '../components/ui/Button'
import { Segmented } from '../components/ui/Segmented'
import { Skeleton } from '../components/ui/Skeleton'
import { TripCard } from '../components/TripCard'
import { TripRow } from '../components/TripRow'
import { EmptyState } from '../components/EmptyState'
import { NewTripSheet } from './NewTripSheet'

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth()
  const nav = useNavigate()
  const { data: profile } = useProfile(user?.id)
  const { data: trips, isLoading } = useTrips(user?.id, profile)
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming')
  const [newOpen, setNewOpen] = useState(false)

  useEffect(() => { if (!authLoading && !user) nav('/auth', { replace: true }) }, [authLoading, user, nav])

  const { upcoming, past } = useMemo(() => splitTrips(trips ?? []), [trips])
  const shown = tab === 'past' ? past : upcoming
  const featured = upcoming[0]
  const firstName = (profile?.name || user?.email?.split('@')[0] || 'traveler').split(/\s+/)[0]
  const openTrip = (id: string) => { location.assign(`/Trip.html?trip=${encodeURIComponent(id)}`) } // legacy planner until Phase 2
  const isTeaser = !!profile && profile.role !== 'founder' && (profile.credits ?? 0) < 1

  return (
    <AppShell right={<Button variant="claret" onClick={() => setNewOpen(true)}>New trip</Button>}>
      <div className="px-5 md:px-8 py-6 max-w-6xl mx-auto">
        <p className="text-muted text-[13px]">
          Good to see you, <span className="text-ink font-semibold">{firstName}</span>
          {featured ? ' — here’s what’s next.' : '.'}
        </p>

        {isLoading ? (
          <Skeleton className="h-[260px] w-full rounded-card mt-4" />
        ) : featured && tab === 'upcoming' ? (
          <div className="mt-4"><TripCard trip={featured} onOpen={openTrip} /></div>
        ) : null}

        <div className="flex items-center justify-between mt-7 mb-4">
          <h2 className="font-serif text-xl">Your trips</h2>
          <Segmented value={tab} onChange={setTab}
            options={[{ value: 'upcoming', label: `Upcoming (${upcoming.length})` }, { value: 'past', label: `Past (${past.length})` }]} />
        </div>

        {isLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{[0, 1, 2].map(i => <Skeleton key={i} className="h-[200px] rounded-card" />)}</div>
        ) : shown.length === 0 ? (
          <EmptyState title={tab === 'past' ? 'No past trips yet' : 'Your next adventure starts here'}
            body={tab === 'past' ? 'Trips you finish will land here as keepsakes.' : 'Create your first trip and plan it day by day.'}
            action={tab === 'upcoming' ? <Button variant="claret" onClick={() => setNewOpen(true)}>Plan a trip</Button> : undefined} />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {shown.map(t => <TripRow key={t.id} trip={t} onOpen={openTrip} />)}
          </div>
        )}
      </div>

      <NewTripSheet open={newOpen} onClose={() => setNewOpen(false)} isTeaser={isTeaser}
        onCreated={(id) => { setNewOpen(false); openTrip(id) }} />
    </AppShell>
  )
}
```

- [ ] **Step 2: Manual verification (against acceptance criteria)**

Run: `cd app && npm run dev`, sign in, open `/trips`.
Expected: intent-led greeting; featured upcoming trip as editorial card; Upcoming/Past segmented control with counts; rows for the rest; beautiful empty state when none; "New trip" opens the 2-step sheet; creating a trip routes to the legacy planner. Light + dark both clean. **Time a fresh create flow — target < 60s.**

- [ ] **Step 3: Commit**

```bash
git add app/src/routes/Dashboard.tsx
git commit -m "feat: Dashboard (featured trip + upcoming/past + new-trip + empty states)"
```

---

## Task 17b: Account menu + per-trip actions (share / delete)

**Files:**
- Create: `app/src/components/ui/IconButton.tsx`, `app/src/components/AccountMenu.tsx`, `app/src/components/ConfirmDialog.tsx`
- Modify: `app/src/routes/Dashboard.tsx`

- [ ] **Step 1: IconButton**

`app/src/components/ui/IconButton.tsx`:
```tsx
import { cn } from '../../lib/utils'
export function IconButton({ label, className, children, ...props }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button {...props} type="button" aria-label={label}
      className={cn('grid place-items-center w-9 h-9 rounded-[10px] bg-black/35 backdrop-blur border border-hair',
        'text-white/90 hover:text-white hover:bg-black/55 transition-colors', className)}>
      {children}
    </button>
  )
}
```

- [ ] **Step 2: AccountMenu (avatar → name/email/role/credits + Sign out)**

`app/src/components/AccountMenu.tsx`:
```tsx
import { useState } from 'react'
import { useAuth } from '../auth/useAuth'
import type { Profile } from '../types'

export function AccountMenu({ email, profile }: { email: string; profile: Profile | null | undefined }) {
  const { signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const name = profile?.name || email.split('@')[0]
  const initial = name.charAt(0).toUpperCase()
  const role = profile?.role ?? 'free'
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} aria-label="Account"
        className="grid place-items-center w-9 h-9 rounded-full bg-sig-btn text-white font-bold text-[14px]">{initial}</button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 z-50 w-64 bg-overlay border border-hair rounded-card p-4 shadow-lift">
            <div className="font-semibold">{name}</div>
            <div className="text-muted text-[13px]">{email}</div>
            <div className="text-muted text-[12px] mt-0.5">
              {role}{role !== 'founder' && profile?.credits != null ? ` · ${profile.credits} credits` : ''}
            </div>
            <div className="h-px bg-hair my-3.5" />
            <button onClick={signOut} className="w-full text-left text-[14px] font-semibold text-sig-link">Sign out</button>
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 3: ConfirmDialog**

`app/src/components/ConfirmDialog.tsx`:
```tsx
import { Sheet } from './ui/Sheet'
import { Button } from './ui/Button'

export function ConfirmDialog({ open, title, body, confirmLabel, busy, onCancel, onConfirm }:
  { open: boolean; title: string; body: string; confirmLabel: string; busy?: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Sheet open={open} onClose={onCancel}>
      <h2 className="font-serif text-2xl">{title}</h2>
      <p className="text-muted text-[14px] mt-2">{body}</p>
      <div className="mt-6 flex gap-2.5">
        <Button variant="soft" className="flex-1" onClick={onCancel}>Cancel</Button>
        <Button variant="claret" className="flex-1" busy={busy} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Sheet>
  )
}
```

- [ ] **Step 4: Wire into Dashboard** — apply these four edits to `app/src/routes/Dashboard.tsx`:

(a) Add imports:
```tsx
import { useDeleteTrip } from '../data/useTrips'
import { isFounder } from '../data/useProfile'
import { ShareSheet } from './ShareSheet'
import { AccountMenu } from '../components/AccountMenu'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { IconButton } from '../components/ui/IconButton'
```

(b) Add state + helpers inside the component (after the `useTrips` line):
```tsx
const del = useDeleteTrip()
const [shareId, setShareId] = useState<string | null>(null)
const [deleteId, setDeleteId] = useState<string | null>(null)
const canManage = (t: typeof upcoming[number]) => isFounder(profile) || (!!t.owner_id && t.owner_id === user?.id)
const tripActions = (t: typeof upcoming[number]) => canManage(t) ? (
  <>
    <IconButton label="Share trip" onClick={() => setShareId(t.id)}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" strokeLinecap="round"/></svg>
    </IconButton>
    <IconButton label="Delete trip" onClick={() => setDeleteId(t.id)}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </IconButton>
  </>
) : undefined
```

(c) Pass `actions` to the featured card and the rows:
```tsx
// featured card:
<TripCard trip={featured} onOpen={openTrip} actions={tripActions(featured)} />
// rows map:
{shown.map(t => <TripRow key={t.id} trip={t} onOpen={openTrip} actions={tripActions(t)} />)}
```

(d) Render the sheets before the closing `</AppShell>` (next to `<NewTripSheet>`):
```tsx
{shareId && <ShareSheet tripId={shareId} open onClose={() => setShareId(null)} />}
<ConfirmDialog open={!!deleteId} title="Delete this trip?"
  body="This removes the trip and all its stops. This can't be undone."
  confirmLabel="Delete" busy={del.isPending}
  onCancel={() => setDeleteId(null)}
  onConfirm={async () => { if (deleteId) { try { await del.mutateAsync(deleteId) } catch { /* ignore */ } setDeleteId(null) } }} />
```

Also add `AccountMenu` to the shell's right slot — change the `right` prop:
```tsx
right={<><AccountMenu email={user?.email ?? ''} profile={profile} /><Button variant="claret" onClick={() => setNewOpen(true)}>New trip</Button></>}
```

- [ ] **Step 5: Typecheck + manual check**

Run: `cd app && npx tsc -b`
Expected: no errors. In the browser: owner/founder sees share + delete on each trip; account avatar opens a menu with name/email/role/credits and Sign out; deleting asks to confirm and removes the trip; sharing opens the invite sheet.

- [ ] **Step 6: Commit**

```bash
git add app/src/components/ui/IconButton.tsx app/src/components/AccountMenu.tsx app/src/components/ConfirmDialog.tsx app/src/routes/Dashboard.tsx
git commit -m "feat: account menu + per-trip share/delete actions on dashboard"
```

---

## Task 18: Landing route

**Files:**
- Modify: `app/src/routes/Landing.tsx`

Visual reference (match closely): `.superpowers/brainstorm/5545-1781812780/content/landing-v2.html`. The CTA is a destination search lifted into the upper-center "sky"; the only oversized hero in the app.

- [ ] **Step 1: Build the Landing hero (image, scrims, glassy nav, search CTA, below-fold story)**

`app/src/routes/Landing.tsx`:
```tsx
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Logo } from '../components/Logo'
import { Button } from '../components/ui/Button'

const HERO = 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=1600&q=80'

export default function Landing() {
  const nav = useNavigate()
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

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
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
          <motion.div key={b.k} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
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
```

- [ ] **Step 2: Manual verification**

Run: `cd app && npm run dev`, open `/`.
Expected: legible hero with the search CTA in the upper-center "sky"; below-fold Plan/Walk/Remember reveal on scroll (and is static under `prefers-reduced-motion`); "Get started" / "Start planning" route to `/auth`. Matches `landing-v2.html`. Both themes (note: Landing is image-forward, reads dark regardless; ensure the below-fold section respects the theme).

- [ ] **Step 3: Commit**

```bash
git add app/src/routes/Landing.tsx
git commit -m "feat: Landing hero (search CTA in the sky) + below-fold story"
```

---

## Task 19: PWA service worker registration + Phase-1 exit QA

**Files:**
- Modify: `app/index.html` (register existing `sw.js`)
- Create: `app/public/manifest.webmanifest`

- [ ] **Step 1: Web manifest**

`app/public/manifest.webmanifest`:
```json
{
  "name": "Voyager", "short_name": "Voyager", "start_url": "/",
  "display": "standalone", "background_color": "#0A0A0C", "theme_color": "#0A0A0C",
  "icons": [{ "src": "/favicon.svg", "sizes": "any", "type": "image/svg+xml" }]
}
```

- [ ] **Step 2: Link manifest + register the (already-copied) service worker**

In `app/index.html` `<head>` add:
```html
<link rel="manifest" href="/manifest.webmanifest" />
```
Before `</body>` add:
```html
<script>
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
  }
</script>
```

- [ ] **Step 3: Full build + preview**

Run: `cd app && npm run build && npm run preview`
Expected: production build serves `/`, `/auth`, `/trips`; `app/dist/Trip.html` reachable; no console errors.

- [ ] **Step 4: Run the whole test suite + typecheck**

Run: `cd app && npm test && npx tsc -b`
Expected: all tests PASS; no type errors.

- [ ] **Step 5: Phase Gate / Definition-of-Done checklist (from IMPLEMENTATION.md)**

Verify and check each in `docs/IMPLEMENTATION.md` Phase 1:
- [ ] Landing matches `landing-v2.html`; a first-time viewer can say what Voyager is.
- [ ] Auth: email+pw, Google, magic link, confirm, URL-error all work.
- [ ] Dashboard: intent greeting, featured trip, Upcoming/Past, sharing, delete, empty state.
- [ ] New trip created in **< 60s** (timed).
- [ ] Voyager Voice on all copy (contractions; outcome-led; no "successfully").
- [ ] Anti-slop + Competitive Rule pass; SVG icons only; only claret/gold accents.
- [ ] A11y: contrast ≥ 4.5:1, focus rings, 44px targets, reduced-motion; 375/768/1024/1440.
- [ ] Works in light **and** dark.
- [ ] No backend regression (auth/sharing still hit the same Supabase RPCs).

- [ ] **Step 6: Commit + tag Phase 1 done**

```bash
git add app/index.html app/public/manifest.webmanifest
git commit -m "feat: PWA manifest + service worker registration; Phase 1 complete"
```

---

## Notes for the executor

- **21st.dev Magic MCP / shadcn:** in Task 9, pull each primitive from the MCP for structure
  and interaction patterns, then conform it to the themed code shown. The shown code is the
  acceptance target; never ship the raw template look.
- **Legacy planner:** opening a trip routes to `/Trip.html?trip=…` on purpose — the React
  planner arrives in Phase 2. The Worker keeps `/<slug>` → `Trip.html` for shared links.
- **Do not touch** Supabase tables, RPCs, or edge functions. This phase only consumes them.
- **Build Priority:** if a visual detail fights a working flow, ship the flow and refine
  visuals after — never the reverse.
