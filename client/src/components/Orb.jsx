import { useEffect, useRef } from 'react';
import { Voice } from '../lib/voice.js';

const VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';

// A glowing ember sphere. `A` (0..1) follows the voice so the orb pulses while MIRA speaks.
const FRAG = `precision highp float;uniform vec2 R;uniform float T;uniform float A;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1.,0.)),u.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),u.x),u.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*n(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
void main(){
  vec2 uv=(gl_FragCoord.xy-.5*R)/(.5*R.y);float rad=.74+.03*A;float r=length(uv);vec3 col=vec3(0.);float al=0.;
  if(r>rad+.012) discard; // fully transparent outside the sphere; the glow is drawn in CSS
  {
    float z=sqrt(max(rad*rad-r*r,0.))/rad;vec3 N=vec3(uv/rad,z);
    vec2 p=N.xy/(.55+z)*1.6;p*=rot(T*.15);float sp=T*(.12+.3*A);
    vec2 q=vec2(fbm(p+sp),fbm(p+vec2(5.2,1.3)-sp));
    vec2 w=vec2(fbm(p+2.4*q+vec2(1.7,9.2)+sp*.7),fbm(p+2.4*q+vec2(8.3,2.8)-sp*.6));
    float f=fbm(p+2.8*w);
    col=vec3(.06,.01,0.);
    col=mix(col,vec3(.55,.08,.01),smoothstep(.25,.6,f));
    col=mix(col,vec3(1.,.36,.06),smoothstep(.45,.8,f+.2*w.x));
    col=mix(col,vec3(1.,.72,.38),smoothstep(.65,.95,w.y+.1*q.x)*.9);
    col+=vec3(1.,.9,.75)*pow(smoothstep(.6,1.,q.x*w.x*1.6),3.)*.8;
    float fr=pow(1.-z,2.2);col+=vec3(1.,.45,.12)*fr*.9;
    col+=vec3(1.)*pow(max(dot(N,normalize(vec3(-.45,.55,.75))),0.),40.)*.7;
    col=mix(col,vec3(.03,.01,.0),smoothstep(rad-.05,rad,r)*.5);
    col*=1.+.4*A;al=smoothstep(rad+.006,rad-.006,r);
  }
  gl_FragColor=vec4(col*al,al);
}`;

const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Compiles the orb shader on a WebGL context. Returns draw(px, time, amp), or null if WebGL fails. */
function orbRenderer(gl) {
  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  let program;
  try {
    program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    gl.useProgram(program);
  } catch {
    return null;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(program, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const uR = gl.getUniformLocation(program, 'R');
  const uT = gl.getUniformLocation(program, 'T');
  const uA = gl.getUniformLocation(program, 'A');
  return (px, time, amp) => {
    gl.viewport(0, 0, px, px);
    gl.uniform2f(uR, px, px);
    gl.uniform1f(uT, time);
    gl.uniform1f(uA, amp);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
}

/**
 * A still image of the orb, cropped tight around the sphere (the tab icon and chat avatars use it).
 * Returns a PNG data URL, or null without WebGL.
 */
export function orbSnapshot(px = 64, time = 9) {
  const render = Math.round(px / 0.76); // the sphere fills about 76% of the drawing
  const cv = document.createElement('canvas');
  cv.width = cv.height = render;
  const gl = cv.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: true, preserveDrawingBuffer: true });
  if (!gl) return null;
  const draw = orbRenderer(gl);
  if (!draw) return null;
  draw(render, time, 0);
  const out = document.createElement('canvas');
  out.width = out.height = px;
  const off = (render - px) / 2;
  out.getContext('2d').drawImage(cv, off, off, px, px, 0, 0, px, px);
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return out.toDataURL('image/png');
}

/** MIRA's logo: a small, live version of the orb. */
export function OrbMark({ className = '' }) {
  return <span className={`mk orb-mk ${className}`} aria-hidden="true"><Orb /></span>;
}

let avatarSrc;
/** MIRA's picture next to chat messages: a still frame of the orb, so long chats stay light. */
export function OrbAvatar({ className = '' }) {
  if (avatarSrc === undefined) avatarSrc = orbSnapshot(96) || null;
  return avatarSrc
    ? <img className={`orb-av ${className}`} src={avatarSrc} alt="" aria-hidden="true" draggable="false" />
    : <span className={`ans-av ${className}`} aria-hidden="true" />;
}

export default function Orb() {
  const hostRef = useRef(null);
  const fallbackRef = useRef(null);

  useEffect(() => {
    // The canvas is created here, not in JSX, so every mount gets a fresh WebGL context.
    const cv = document.createElement('canvas');
    cv.className = 'orb-canvas';
    cv.setAttribute('aria-hidden', 'true');
    hostRef.current.appendChild(cv);
    const restore = () => cv.remove();
    const gl = cv.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: true });
    const showFallback = () => {
      restore();
      fallbackRef.current.hidden = false;
      return undefined;
    };
    if (!gl) return showFallback();
    const draw = orbRenderer(gl);
    if (!draw) return showFallback();

    let raf;
    let last = performance.now();
    let time = 0;
    let amp = 0;
    const frame = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const talking = Voice.speaking && !Voice.paused;
      const env = talking ? 0.5 + 0.5 * Math.abs(Math.sin(now / 105) * Math.sin(now / 171)) : 0;
      amp += (env - amp) * Math.min(dt * 9, 1);
      time += dt * (reduce ? 0.15 : 1) * (1 + amp * 1.5);
      if (!document.hidden && cv.clientWidth > 12) {
        // Small logos render at a higher pixel ratio so they stay crisp.
        const ratio = cv.clientWidth < 80 ? Math.min(devicePixelRatio || 1, 2) : Math.min(devicePixelRatio || 1, 1.5);
        const px = Math.round(cv.clientWidth * ratio);
        if (cv.width !== px) cv.width = cv.height = px;
        draw(px, time, amp);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      restore();
    };
  }, []);

  return (
    <>
      <span className="orb-aura" aria-hidden="true" />
      <span ref={hostRef} style={{ display: 'contents' }} />
      <span
        ref={fallbackRef}
        hidden
        aria-hidden="true"
        style={{ width: '80%', height: '80%', borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%,#ffe0c2 0,#ff9a4d 20%,#ff5b14 50%,#5a1200 100%)', boxShadow: '0 0 40px rgba(255,91,20,.6)' }}
      />
    </>
  );
}
