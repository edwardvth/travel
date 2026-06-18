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
        fill: 'var(--fill)', 'fill-hover': 'var(--fill-hover)', skeleton: 'var(--skeleton)',
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
