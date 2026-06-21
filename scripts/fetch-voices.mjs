// Fetch ElevenLabs voice names + accents for the curated Guide voices.
// Run in YOUR OWN terminal so the key never enters the Claude chat/transcript:
//
//   PowerShell:  $env:ELEVENLABS_API_KEY="sk_xxx"; node scripts/fetch-voices.mjs
//   Bash:        ELEVENLABS_API_KEY=sk_xxx node scripts/fetch-voices.mjs
//
// Then paste back only the printed "Name - Accent" lines (NOT the key).

import { readFileSync } from 'node:fs'

// Key from env, or from the gitignored app/.env.local (line: ELEVENLABS_API_KEY=sk_...)
function keyFromEnvFile() {
  try {
    const t = readFileSync('C:/Users/edwar/travel/app/.env.local', 'utf8')
    const m = t.match(/^\s*ELEVENLABS_API_KEY\s*=\s*(.+?)\s*$/m)
    return m ? m[1].replace(/^["']|["']$/g, '') : null
  } catch { return null }
}
const KEY = process.env.ELEVENLABS_API_KEY || keyFromEnvFile()
if (!KEY) {
  console.error('No ELEVENLABS_API_KEY in env or app/.env.local.')
  process.exit(1)
}

const IDS = [
  'pXgsayqpmuFfzTsJw2ni',
  'jg80CzGPSxCeNz7dJVDZ',
  'xzZRXG86mSM3naOyL9fa',
  '8Ln42OXYupYsag45MAUy', // default
  'wScwPA1qCkWo5R2dmlS8',
]

for (const id of IDS) {
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/voices/${id}`, {
      headers: { 'xi-api-key': KEY },
    })
    if (!r.ok) { console.log(`${id}  ->  ERROR ${r.status}`); continue }
    const v = await r.json()
    const L = v.labels || {}
    const accent = L.accent || L.descriptive || L.description || '?'
    const extra = [L.gender, L.age, L.use_case].filter(Boolean).join(', ')
    console.log(`${id}  ->  ${v.name} - ${accent}${extra ? `  (${extra})` : ''}`)
  } catch (e) {
    console.log(`${id}  ->  ERROR ${e.message}`)
  }
}
