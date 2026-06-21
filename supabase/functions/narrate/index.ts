// supabase/functions/narrate/index.ts
const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const BUCKET = 'narration'
const RATE_LIMIT_PER_HOUR = 120
const rate = new Map<string, { count: number; resetAt: number }>()
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function ok(ip: string) {
  const now = Date.now(); const e = rate.get(ip)
  if (!e || now > e.resetAt) { rate.set(ip, { count: 1, resetAt: now + 3600_000 }); return true }
  if (e.count >= RATE_LIMIT_PER_HOUR) return false
  e.count++; return true
}
async function storageGet(path: string): Promise<ArrayBuffer | null> {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, { headers: { Authorization: `Bearer ${SERVICE_KEY}` } })
  return r.ok ? await r.arrayBuffer() : null
}
async function storagePut(path: string, body: ArrayBuffer) {
  await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'audio/mpeg', 'x-upsert': 'true' },
    body,
  })
}
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS })
  if (!ELEVENLABS_API_KEY) return new Response('Not configured', { status: 500, headers: CORS })
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  if (!ok(ip)) return new Response('Rate limit', { status: 429, headers: CORS })
  let body: { text?: string; voiceId?: string; key?: string }
  try { body = await req.json() } catch { return new Response('Bad JSON', { status: 400, headers: CORS }) }
  const text = (body.text ?? '').slice(0, 5000)
  const voiceId = body.voiceId ?? ''
  const key = body.key ?? ''
  if (!text || !voiceId || !key) return new Response('Missing params', { status: 400, headers: CORS })

  const path = `${voiceId}/${key}.mp3`
  const cached = await storageGet(path)
  if (cached) return new Response(cached, { headers: { ...CORS, 'Content-Type': 'audio/mpeg', 'X-Cache': 'HIT' } })

  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'xi-api-key': ELEVENLABS_API_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2' }),
  })
  if (!r.ok) return new Response(`TTS failed (${r.status})`, { status: 502, headers: CORS })
  const audio = await r.arrayBuffer()
  await storagePut(path, audio) // fire-and-forget cache; errors ignored
  return new Response(audio, { headers: { ...CORS, 'Content-Type': 'audio/mpeg', 'X-Cache': 'MISS' } })
})
