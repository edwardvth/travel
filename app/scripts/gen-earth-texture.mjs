// One-off: download a public-domain night-lights world map and encode a small
// WebP for the field-globe shader. Run once; the .webp is committed so normal
// builds need no network or sharp. Usage: `node scripts/gen-earth-texture.mjs`
// (requires a one-off `npm i -D sharp`, which may be removed afterward).
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'

const SRC = 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_lights_2048.png'
const OUT = new URL('../src/assets/earth-night.webp', import.meta.url)

const res = await fetch(SRC)
if (!res.ok) throw new Error(`download failed: ${res.status}`)
const png = Buffer.from(await res.arrayBuffer())
const tmp = join(tmpdir(), 'earth_lights_2048.png')
await writeFile(tmp, png)

await mkdir(new URL('../src/assets/', import.meta.url), { recursive: true })
await sharp(tmp).resize(1024, 512).webp({ quality: 94 }).toFile(OUT.pathname.replace(/^\//, ''))
console.log('wrote', OUT.pathname)
