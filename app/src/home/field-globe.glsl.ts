/**
 * Field-Globe shader source (Phase 2). Reproduces the approved visual output of
 * the prototype (scratchpad/field-earth.html): the night-Earth limb seen from
 * low orbit — warm orange limb → blue airglow, gold city lights on the dark
 * earth (photo + synthesized), faint stars, slow travel arcs echoing the curve.
 *
 * The look-defining parameters are baked into the fragment source as `const`
 * declarations from FIELD_GLOBE_PARAMS (frozen, so the signed-off values can't
 * be mutated at runtime). Only truly dynamic values are real uniforms:
 *   uResolution, uTime, uReduce (freeze for reduced motion), uArcSamples
 *   (adaptive quality — caps the per-pixel bezier loop), uEarth (night texture).
 */

export const FIELD_GLOBE_PARAMS = Object.freeze({
  uHorizon: -0.06,
  uCurve: 0.5,
  uGlow: 0.6,
  uWarmth: 0.4,
  uCities: 1.1,
  uEarthZoom: 0.43,
  uEarthPanY: 0.12,
  uDrift: 0.02,
  uArcOpacity: 0.12,
  uArcCount: 2,
  uArcSpeed: 0.04,
  uArcHeight: 0.16,
  uVignette: 0.7,
  limb: Object.freeze([1.0, 0.64, 0.3] as const),
  air: Object.freeze([0.3, 0.55, 0.96] as const),
})

export type FieldGlobeParams = typeof FIELD_GLOBE_PARAMS

/** Max bezier samples per arc; the loop runs `min(this, uArcSamples)`. */
export const MAX_ARC_SAMPLES = 26

export const VERTEX_SRC = `#version 300 es
in vec2 a_pos;
void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }`

/** Emit a GLSL float literal (always contains a decimal point). */
const f = (n: number): string => (Number.isInteger(n) ? n.toFixed(1) : String(n))
const v3 = (c: readonly number[]): string => `vec3(${c.map(f).join(',')})`

export function fragmentSource(p: FieldGlobeParams = FIELD_GLOBE_PARAMS): string {
  return `#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2 uResolution;
uniform float uTime;
uniform float uReduce;
uniform float uArcSamples;
uniform sampler2D uEarth;

const float uHorizon=${f(p.uHorizon)}, uCurve=${f(p.uCurve)}, uGlow=${f(p.uGlow)}, uWarmth=${f(p.uWarmth)}, uCities=${f(p.uCities)},
            uEarthZoom=${f(p.uEarthZoom)}, uEarthPanY=${f(p.uEarthPanY)}, uDrift=${f(p.uDrift)}, uArcOpacity=${f(p.uArcOpacity)},
            uArcCount=${f(p.uArcCount)}, uArcSpeed=${f(p.uArcSpeed)}, uArcHeight=${f(p.uArcHeight)}, uVignette=${f(p.uVignette)};
const vec3 uLimb=${v3(p.limb)}, uAir=${v3(p.air)};

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
  float t = (uReduce > 0.5) ? 12.0 : uTime;

  float irad = earthRad();
  float icy  = earthCy();
  float rr   = length(vec2(p.x, p.y - icy));
  float dist = rr - irad;

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
      float h0 = hash21(i0);
      vec2 j0 = (vec2(hash21(i0+3.7), hash21(i0+7.1)) - 0.5) * 0.8;
      pts += smoothstep(0.40, 0.0, length(f0 - j0)) * step(0.42, h0) * (0.65 + 0.35*sin(t*1.6 + h0*40.0)) * 0.7;
      vec2 g1 = sp * 168.0; vec2 i1 = floor(g1); vec2 f1 = fract(g1) - 0.5;
      float h1 = hash21(i1 + 19.3);
      vec2 j1 = (vec2(hash21(i1+5.1), hash21(i1+8.9)) - 0.5) * 0.8;
      pts += smoothstep(0.34, 0.0, length(f1 - j1)) * step(0.52, h1) * (0.6 + 0.4*sin(t*1.3 + h1*55.0));
      col += vec3(1.00, 0.84, 0.52) * pts * cityAmt * uCities;
      col += vec3(1.00, 0.66, 0.34) * cityAmt * cityAmt * uCities * 0.08;
    }
  }

  float td = t * uDrift;
  float n  = fbm(vec2(p.x*2.2, dist*2.6) + vec2(td, td*0.4))*0.5 + 0.5;
  float core  = exp(-abs(dist) * 22.0);
  float bloom = exp(-abs(dist) * 9.0);
  float halo  = exp(-max(dist, 0.0) * 4.5);
  float under = exp(-max(-dist, 0.0) * 8.0);
  vec3 atmo = uLimb*core*0.50 + uLimb*bloom*(0.08 + uWarmth*0.12)
            + uAir*halo*0.18*(0.72 + 0.4*n) + uLimb*under*0.10;
  col += atmo * uGlow;

  if (dist > 0.05) {
    vec2 sg = vec2(p.x, p.y) * 46.0; vec2 sid = floor(sg);
    float shh = hash21(sid + 19.7);
    if (shh > 0.987) {
      vec2 sf = fract(sg) - 0.5;
      float stw = 0.5 + 0.5*sin(t*0.7 + shh*55.0);
      col += vec3(0.55,0.62,0.85) * smoothstep(0.08,0.0,length(sf)) * 0.10 * stw * smoothstep(0.05,0.30,dist);
    }
  }

  float glow = 0.0;
  for(int i=0;i<3;i++){
    if(float(i) >= uArcCount) break;
    float fi = float(i);
    float life = fract(t*uArcSpeed + fi*0.40);
    float env  = smoothstep(0.0,0.14,life) * smoothstep(1.0,0.74,life);
    float ax = -0.62 + 0.26*fi + 0.12*sin(t*0.05 + fi*1.3);
    float bx =  0.60 - 0.22*fi + 0.12*cos(t*0.04 + fi*1.7);
    vec2 A = vec2(ax, horizonY(ax)+0.004);
    vec2 B = vec2(bx, horizonY(bx)+0.004);
    vec2 mid = vec2((ax+bx)*0.5, max(A.y,B.y) + uArcHeight + 0.04*fi);
    float d = 1e3;
    for(int k=0;k<=${MAX_ARC_SAMPLES};k++){
      if(float(k) > uArcSamples) break;
      float tt=float(k)/${f(MAX_ARC_SAMPLES)};
      vec2 bp=mix(mix(A,mid,tt),mix(mid,B,tt),tt);
      d=min(d,length(p-bp));
    }
    glow += env * exp(-d*d*2600.0);
  }
  col += vec3(1.00, 0.92, 0.78) * glow * uArcOpacity * 1.6;

  float r = length(p);
  col *= mix(1.0, smoothstep(1.3, 0.2, r), uVignette);
  fragColor = vec4(col, 1.0);
}`
}
