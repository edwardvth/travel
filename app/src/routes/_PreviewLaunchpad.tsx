import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Mark } from '../components/Logo'
import { HeroSearchPill } from '../hero/HeroSearchPill'
import { HeroMicroDetails } from '../hero/HeroMicroDetails'
import { HeroVideoStage } from '../hero/HeroVideoStage'
import { clipForWord, FIRST_CLIP, upcomingClips } from '../hero/wordClips'
import type { HeroClip } from '../hero/types'
import earthUrl from '../assets/earth-night.webp'

/**
 * TEMPORARY preview-only route (no auth). Full-bleed cinematic launchpad.
 * variant 'fade'  — clip fades into page black.
 * variant 'globe' — clip masks out and merges into the night-Earth shader.
 * Delete before merge. Mounted at /x-launchpad-fade and /x-launchpad-globe.
 */

const PAST = [
  { name: 'Positano', date: 'Jun 2025 · 4 days', img: '/video/positano.jpg' },
  { name: 'Kyoto', date: 'Apr 2025 · 6 days', img: '/video/kyoto.jpg' },
  { name: 'Banff', date: 'Sep 2024 · 5 days', img: '/video/banff.jpg' },
]

/* ---- self-contained night-Earth background (proven inline shader) ---- */
const VERT = `#version 300 es
in vec2 a_pos; void main(){ gl_Position = vec4(a_pos,0.,1.); }`
const FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2 uResolution; uniform float uTime; uniform sampler2D uEarth;
const float uHorizon=-0.06, uCurve=0.50, uGlow=0.60, uWarmth=0.40, uCities=1.10,
            uEarthZoom=0.43, uEarthPanY=0.12, uDrift=0.02, uArcOpacity=0.12,
            uArcCount=2.0, uArcSpeed=0.04, uArcHeight=0.16, uVignette=0.70;
const vec3 uLimb=vec3(1.00,0.64,0.30), uAir=vec3(0.30,0.55,0.96);
vec3 mod289(vec3 x){ return x - floor(x*(1.0/289.0))*289.0; }
vec2 mod289(vec2 x){ return x - floor(x*(1.0/289.0))*289.0; }
vec3 permute(vec3 x){ return mod289(((x*34.0)+1.0)*x); }
float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
  vec2 i=floor(v+dot(v,C.yy)); vec2 x0=v-i+dot(i,C.xx);
  vec2 i1=(x0.x>x0.y)?vec2(1.,0.):vec2(0.,1.);
  vec4 x12=x0.xyxy+C.xxzz; x12.xy-=i1; i=mod289(i);
  vec3 p=permute(permute(i.y+vec3(0.,i1.y,1.))+i.x+vec3(0.,i1.x,1.));
  vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.);
  m=m*m; m=m*m;
  vec3 x=2.*fract(p*C.www)-1.; vec3 h=abs(x)-0.5; vec3 ox=floor(x+0.5); vec3 a0=x-ox;
  m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);
  vec3 g; g.x=a0.x*x0.x+h.x*x0.y; g.yz=a0.yz*x12.xz+h.yz*x12.yw;
  return 130.0*dot(m,g);
}
float fbm(vec2 p){ float v=0.,a=0.5; for(int i=0;i<5;i++){ v+=a*snoise(p); p*=2.02; a*=0.5; } return v; }
float hash21(vec2 p){ p=fract(p*vec2(123.34,345.45)); p+=dot(p,p+34.345); return fract(p.x*p.y); }
float earthRad(){ return mix(1.9, 0.7, clamp(uCurve/1.2, 0.0, 1.0)); }
float earthCy(){ return uHorizon - earthRad(); }
float horizonY(float x){ float R=earthRad(); float Cy=earthCy(); return Cy + sqrt(max(R*R - x*x, 0.0)); }
void main(){
  vec2 res = uResolution;
  vec2 p = (gl_FragCoord.xy - 0.5*res)/res.y;
  float t = uTime;
  float irad = earthRad(); float icy = earthCy();
  float rr = length(vec2(p.x, p.y - icy)); float dist = rr - irad;
  vec3 sky = mix(vec3(0.012,0.020,0.044), vec3(0.003,0.007,0.018), smoothstep(0.9,0.0,dist));
  vec3 col = sky;
  if (dist < 0.0) {
    vec2 uv = vec2(0.5 + (p.x / irad) * uEarthZoom + uDrift * t * 0.012,
                   0.5 - ((p.y - icy) / irad) * uEarthZoom + uEarthPanY);
    vec3 tex = texture(uEarth, uv).rgb;
    vec3 texB = (tex
      + texture(uEarth, uv + vec2(0.004,0.0)).rgb + texture(uEarth, uv - vec2(0.004,0.0)).rgb
      + texture(uEarth, uv + vec2(0.0,0.004)).rgb + texture(uEarth, uv - vec2(0.0,0.004)).rgb) * 0.2;
    float lum = max(max(tex.r, tex.g), tex.b);
    float landish  = (texB.r + texB.g) * 0.5 - texB.b * 0.55 + lum * 0.30;
    float landMask = smoothstep(0.02, 0.11, landish);
    col = mix(vec3(0.005,0.012,0.030), vec3(0.032,0.031,0.033), clamp(landMask, 0.0, 1.0));
    col += vec3(0.90,0.62,0.34) * landMask * 0.012;
    float cityAmt = smoothstep(0.17, 0.52, lum);
    float eu = smoothstep(0.15, 0.0, length((uv - vec2(0.71, 0.255)) * vec2(1.0, 1.5)));
    float af = smoothstep(0.17, 0.0, length((uv - vec2(0.64, 0.345)) * vec2(1.1, 1.0)));
    float eastLand = clamp(eu + af, 0.0, 1.0);
    col = mix(col, vec3(0.030, 0.029, 0.031), eastLand * 0.8);
    col += vec3(0.90, 0.62, 0.34) * eastLand * 0.012;
    float eastPop = eastLand * (0.45 + 0.55 * fbm(uv * 10.0 + 30.0));
    cityAmt = max(cityAmt, smoothstep(0.32, 0.85, eastPop));
    if (cityAmt > 0.002) {
      vec2 sp = gl_FragCoord.xy / uResolution.y;
      float pts = 0.0;
      vec2 g0 = sp * 300.0; vec2 i0 = floor(g0); vec2 f0 = fract(g0) - 0.5;
      float h0 = hash21(i0); vec2 j0 = (vec2(hash21(i0+3.7), hash21(i0+7.1)) - 0.5) * 0.8;
      pts += smoothstep(0.40, 0.0, length(f0 - j0)) * step(0.42, h0) * (0.65 + 0.35*sin(t*1.6 + h0*40.0)) * 0.7;
      vec2 g1 = sp * 168.0; vec2 i1 = floor(g1); vec2 f1 = fract(g1) - 0.5;
      float h1 = hash21(i1 + 19.3); vec2 j1 = (vec2(hash21(i1+5.1), hash21(i1+8.9)) - 0.5) * 0.8;
      pts += smoothstep(0.34, 0.0, length(f1 - j1)) * step(0.52, h1) * (0.6 + 0.4*sin(t*1.3 + h1*55.0));
      col += vec3(1.00, 0.84, 0.52) * pts * cityAmt * uCities;
      col += vec3(1.00, 0.66, 0.34) * cityAmt * cityAmt * uCities * 0.08;
    }
  }
  float td = t * uDrift;
  float n  = fbm(vec2(p.x*2.2, dist*2.6) + vec2(td, td*0.4))*0.5 + 0.5;
  float core = exp(-abs(dist) * 22.0); float bloom = exp(-abs(dist) * 9.0);
  float halo = exp(-max(dist, 0.0) * 4.5); float under = exp(-max(-dist, 0.0) * 8.0);
  vec3 atmo = uLimb*core*0.50 + uLimb*bloom*(0.08 + uWarmth*0.12)
            + uAir*halo*0.18*(0.72 + 0.4*n) + uLimb*under*0.10;
  col += atmo * uGlow;
  if (dist > 0.05) {
    vec2 sg = vec2(p.x, p.y) * 46.0; vec2 sid = floor(sg);
    float shh = hash21(sid + 19.7);
    if (shh > 0.987) { vec2 sf = fract(sg) - 0.5; float stw = 0.5 + 0.5*sin(t*0.7 + shh*55.0);
      col += vec3(0.55,0.62,0.85) * smoothstep(0.08,0.0,length(sf)) * 0.10 * stw * smoothstep(0.05,0.30,dist); }
  }
  float glow = 0.0;
  for(int i=0;i<3;i++){
    if(float(i) >= uArcCount) break;
    float fi = float(i); float life = fract(t*uArcSpeed + fi*0.40);
    float env = smoothstep(0.0,0.14,life) * smoothstep(1.0,0.74,life);
    float ax = -0.62 + 0.26*fi + 0.12*sin(t*0.05 + fi*1.3);
    float bx =  0.60 - 0.22*fi + 0.12*cos(t*0.04 + fi*1.7);
    vec2 A = vec2(ax, horizonY(ax)+0.004); vec2 B = vec2(bx, horizonY(bx)+0.004);
    vec2 mid = vec2((ax+bx)*0.5, max(A.y,B.y) + uArcHeight + 0.04*fi);
    float d = 1e3;
    for(int k=0;k<=26;k++){ float tt=float(k)/26.0; vec2 bp=mix(mix(A,mid,tt),mix(mid,B,tt),tt); d=min(d,length(p-bp)); }
    glow += env * exp(-d*d*2600.0);
  }
  col += vec3(1.00, 0.92, 0.78) * glow * uArcOpacity * 1.6;
  float r = length(p);
  col *= mix(1.0, smoothstep(1.3, 0.2, r), uVignette);
  fragColor = vec4(col, 1.0);
}`

function GlobeBackground({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false })
    if (!gl) return
    const sh = (ty: number, s: string) => {
      const o = gl.createShader(ty)!; gl.shaderSource(o, s); gl.compileShader(o)
      if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(o))
      return o
    }
    const prog = gl.createProgram()!
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(prog); gl.useProgram(prog)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'a_pos')
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    const uRes = gl.getUniformLocation(prog, 'uResolution')
    const uT = gl.getUniformLocation(prog, 'uTime')
    gl.uniform1i(gl.getUniformLocation(prog, 'uEarth'), 0)
    const tex = gl.createTexture()
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([3, 7, 18, 255]))
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    const img = new Image()
    img.onload = () => { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img) }
    img.src = earthUrl
    const DPR = Math.min(window.devicePixelRatio || 1, 1.5)
    let raf = 0
    const t0 = performance.now()
    const loop = (now: number) => {
      const w = Math.max(1, Math.floor(canvas.clientWidth * DPR)), h = Math.max(1, Math.floor(canvas.clientHeight * DPR))
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h) }
      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.uniform1f(uT, (now - t0) / 1000)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
  return <canvas ref={ref} aria-hidden="true" className={className} style={{ display: 'block' }} />
}

export default function PreviewLaunchpad({ variant = 'fade' }: { variant?: 'fade' | 'globe' }) {
  const reduce = useReducedMotion()
  const go = () => {}

  const [clip, setClip] = useState(FIRST_CLIP)
  const [upcoming, setUpcoming] = useState<HeroClip[]>([])
  const onWord = (word: string) => {
    setClip(clipForWord(word))
    setUpcoming(upcomingClips(word, 3))
  }

  const isGlobe = variant === 'globe'

  const tripsBlock = (
    <>
      <h2
        className="mb-5 text-left font-serif text-[clamp(22px,3.2vw,30px)] font-medium tracking-tight text-white"
        style={{ textShadow: '0 2px 24px rgba(0,0,0,.55)' }}
      >
        Past voyages
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PAST.map((t) => (
          <div
            key={t.name}
            className="overflow-hidden rounded-card border border-white/15 bg-white/[0.06] backdrop-blur-xl shadow-[0_10px_34px_rgba(0,0,0,.35)]"
          >
            <div className="h-[120px] bg-cover bg-center" style={{ backgroundImage: `url('${t.img}')` }} />
            <div className="px-4 py-3">
              <div className="font-serif text-xl text-white">{t.name}</div>
              <div className="mt-0.5 text-[12px] text-white/65">{t.date}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  )

  return (
    <div className="relative bg-[#07070b] text-white">
      {/* GLOBE variant: tall night-Earth background behind everything — dark sky sits
          behind the clip; the bright limb + arcs are LOW, behind the tiles. */}
      {isGlobe && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[185vh] overflow-hidden">
          <GlobeBackground className="absolute inset-x-0 top-[20vh] h-[170vh] w-full" />
        </div>
      )}

      {/* Cinematic hero. */}
      <section className="relative z-10 h-[100svh] min-h-[620px] overflow-hidden">
        {isGlobe ? (
          // Video DISSOLVES at its bottom into the globe's dark sky — no black block,
          // no hard cutoff; the clip stays visible until low, then merges into the globe.
          <div
            className="absolute inset-0"
            style={{
              WebkitMaskImage: 'linear-gradient(to bottom, #000 70%, transparent 96%)',
              maskImage: 'linear-gradient(to bottom, #000 70%, transparent 96%)',
              filter: 'brightness(1.8)',
            }}
          >
            <HeroVideoStage clip={clip} upcoming={upcoming} className="absolute inset-0" />
          </div>
        ) : (
          <>
            <div className="absolute inset-0" style={{ filter: 'brightness(1.8)' }}>
              <HeroVideoStage clip={clip} upcoming={upcoming} className="absolute inset-0" />
            </div>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-[42%]"
              style={{ background: 'linear-gradient(to bottom, rgba(7,7,11,0) 0%, rgba(7,7,11,0.65) 55%, #07070b 100%)' }}
            />
          </>
        )}

        <nav className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-6 md:px-10 py-5 md:py-6 text-white">
          <span className="inline-flex items-center gap-2 font-sans font-extrabold tracking-tight">
            <span className="text-sig-link"><Mark size={30} /></span>
            <span className="font-serif text-[20px] md:text-[23px]">Voyager</span>
          </span>
          <span className="inline-flex items-center gap-2 rounded-full bg-sig px-4 py-2 text-[13px] font-medium text-white">
            + New trip
          </span>
        </nav>

        <motion.div
          initial={reduce ? false : { y: 12 }}
          animate={{ y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-none absolute inset-x-0 top-0 z-20 flex h-full flex-col items-center px-5 text-center text-white pt-[16vh] md:pt-[18vh]"
        >
          <div className="font-mono text-[11px] md:text-[12px] uppercase tracking-[0.32em] text-white/85">
            Plan · Walk · Remember
          </div>
          <h1
            className="mt-4 font-serif font-medium tracking-tight text-[44px] leading-[1.02] md:text-[70px]"
            style={{ textShadow: '0 2px 30px rgba(0,0,0,.6)' }}
          >
            Where to next?
          </h1>
          <p className="mt-4 md:mt-5 font-sans italic text-[15px] md:text-[18px] text-white/85">
            Name a city and we'll start the itinerary, day by day.
          </p>

          <HeroSearchPill
            onSubmit={go}
            onWordStart={onWord}
            className="pointer-events-auto mt-[calc(8vh_+_2.25rem)] md:mt-10"
          />
          <HeroMicroDetails className="mt-4" />
        </motion.div>
      </section>

      {isGlobe ? (
        // Tiles sit OVER the globe background (showing through from behind); the globe's
        // arcs/limb land behind them. No black block — the video already dissolved in.
        <section className="relative z-10 -mt-[18vh]">
          <div className="mx-auto max-w-6xl px-5 md:px-8 pt-[2vh] pb-[40vh]">
            {tripsBlock}
          </div>
        </section>
      ) : (
        // Fade variant: trips overlap up into the hero's fade, on page black.
        <section className="relative z-10 mx-auto -mt-[26vh] max-w-6xl px-5 md:px-8 pb-24">
          {tripsBlock}
        </section>
      )}

    </div>
  )
}
