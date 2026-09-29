/* The trace: the one moving thing on the site.
 *
 * Lanes run left to right, a switch line stands across them, and a 120 BPM clock fires a burst of
 * packets on every beat. Each packet turns amber the instant it crosses the switch, because that is
 * the moment it is verified. It is E-Jam's test bench and PolyBall's beat in the same drawing, and
 * it is literally true of both: the bench fires packets through a switch and checks what comes out,
 * the game synthesises a note the instant a tap lands on the beat.
 *
 * Drawn as light on a phosphor screen. Raw WebGL 1 + ANGLE_instanced_arrays, no library. Three draw
 * calls a frame: the lane field (one fullscreen fragment pass carrying antialiased hairlines, the
 * switch and the beat pulse), packet bodies and packet heads (instanced: every packet is a pure
 * function of time, so the CPU touches a few uniforms and one 16 KB buffer per frame), plus a
 * persistence layer: a CSS-pixel-resolution framebuffer that fades by e^(-t/0.4 s) and receives
 * every frame's packets, so the field keeps an afterglow of everything that moved. In the light
 * theme the same layer composites as ink, so it reads as graphite on paper instead of light.
 *
 * three.js would have been ~150 KB gzipped for three shaders and five draw calls. This is 9 KB with
 * its own 2D fallback inside it.
 *
 * Fallback: the 2D Canvas trace below takes over on a second canvas when WebGL is missing, blocked,
 * fails to compile, or the context is lost, carrying the pause state and the verified count with it.
 *
 * Accessibility: one rAF, stopped off-screen and in hidden tabs. Pause is a real <button> whose
 * visible label is its name (WCAG 2.2.2). Under prefers-reduced-motion it draws one static frame and
 * the clock never starts.
 *
 *   import { start } from './trace.js';
 *   const trace = start(glCanvas, { fallback: canvas2d, onBeat });
 *   trace.pause(); trace.resume(); trace.burst(); trace.recolor(); trace.verified(); trace.dispose();
 *
 * Also dispatches a `trace-beat` event on the canvas every beat, for anything that wants the clock
 * without owning the trace.
 *
 * Two knobs if a real phone drops frames (measured on a desktop GPU only, see PLAN.md §6.6):
 * `dprCap` (2 -> 1.5) first, then `persist: false` to skip the framebuffer pass.
 */

const root = document.documentElement;
const calm = matchMedia('(prefers-reduced-motion: reduce)');

const GLSL_BEND = `
uniform vec2 uRes, uPtr; uniform float uSwX, uAge, uPar, uPtrW;
float near(vec2 p) { vec2 d = (p - uPtr) / 150.0; return exp(-dot(d, d)) * uPtrW; }     // the probe: 1 under the pointer, 0 a lane away
float bend(float x, float ly, float far) {
  float dx = (x - uPtr.x) / 220.0;
  float p = clamp((uPtr.y - ly) * 0.15, -24.0, 24.0) * exp(-dx * dx) * uPtrW;         // the pointer pulls the lane
  float d = abs(x - uSwX) - uAge * 1500.0;                                               // a pluck runs out from the switch on the beat
  float w = 9.0 * exp(-d * d / 9000.0) * exp(-uAge * 3.5) * sign(ly - uRes.y * 0.5 + 0.001);
  return mix(p + w, 0.5 * (p + w) + uPar, far);                                          // far lanes: half the bend, plus parallax
}
vec2 clip(vec2 p) { return vec2(p.x / uRes.x * 2.0 - 1.0, 1.0 - p.y / uRes.y * 2.0); }`;
const GLSL_PREC = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;
const VS_FIELD = `attribute vec2 aUV; uniform vec2 uRes; varying vec2 vXY;
void main() { vXY = vec2((aUV.x * 0.5 + 0.5) * uRes.x, (0.5 - aUV.y * 0.5) * uRes.y); gl_Position = vec4(aUV, 0.0, 1.0); }`;
const FS_FIELD = GLSL_PREC + `varying vec2 vXY; uniform float uN, uFlash, uSign, uGlowW; uniform vec3 uBg, uMid, uSig; uniform sampler2D uGlow;
${GLSL_BEND}
float lane(float ly, float far) { return 1.0 - smoothstep(0.35, 1.1, abs(vXY.y - ly - bend(vXY.x, ly, far))); }
void main() {
  float sp = uRes.y / uN, i = floor(vXY.y / sp);
  float near = lane((i + 0.5) * sp, 0.0) + lane((i - 0.5) * sp, 0.0);                 // near lanes at (i+.5)sp, the two closest
  float far = lane(i * sp, 1.0) * step(0.5, i) + lane((i + 1.0) * sp, 1.0) * step(i + 1.5, uN); // far lanes between them, none on the edges
  float dsw = abs(vXY.x - uSwX);
  float sw = (1.0 - smoothstep(0.6, 1.6, dsw)) * (0.45 + 0.55 * uFlash);
  float s = 9.0 + 20.0 * uFlash;
  float glow = exp(-dsw * dsw / (2.0 * s * s)) * (0.06 + 0.18 * uFlash);
  float wf = dsw - uAge * 1500.0;
  float wave = exp(-wf * wf / 6000.0) * exp(-uAge * 3.5) * 0.12;
  vec3 c = mix(uBg, uMid, clamp(near * 0.14 + far * 0.07, 0.0, 1.0));
  c = mix(c, uSig, clamp(sw + glow + wave, 0.0, 1.0));
  c += uSign * uGlowW * texture2D(uGlow, vec2(vXY.x / uRes.x, 1.0 - vXY.y / uRes.y)).rgb;   // the afterglow: light in the dark theme, ink in the light one
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;
const VS_BODY = `attribute vec2 aUV; attribute vec4 aA; attribute vec4 aB; uniform float uTime, uN;
varying vec2 vUV; varying float vAlpha, vSeen, vNear;
${GLSL_BEND}
void main() {
  float t = uTime - aA.x, far = aB.y;
  float x1 = -20.0 + aA.z * t;
  float k = clamp((x1 - uSwX) / aA.z, 0.0, 1.0);                                          // seconds since verification, 0..1
  float x0 = x1 - aA.w - 70.0 * (1.0 - exp(-k * 3.0));                                     // phosphor: the tail stretches after the switch
  if (t < 0.0 || x0 > uRes.x + 20.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vUV = vec2(0.0); vAlpha = 0.0; vSeen = 0.0; vNear = 0.0; return; }
  float ly = (aA.y + 0.5 - 0.5 * far) * uRes.y / uN;
  float x = mix(x0, x1, aUV.x);
  float y = ly + bend(x, ly, far) + aUV.y * mix(1.6, 1.1, far);
  gl_Position = vec4(clip(vec2(x, y)), 0.0, 1.0);
  vUV = aUV; vAlpha = aB.x * mix(1.0, 0.4, far); vSeen = step(uSwX, x1); vNear = near(vec2(x, y));
}`;
const FS_BODY = GLSL_PREC + `varying vec2 vUV; varying float vAlpha, vSeen, vNear; uniform vec3 uInk, uSig, uBg; uniform float uToGlow;
void main() {
  float core = 1.0 - smoothstep(0.5, 0.9, abs(vUV.y));
  float a = core * (0.18 + 0.82 * vUV.x * vUV.x) * vAlpha * mix(0.8, 0.95, vSeen) * (1.0 + 0.4 * vNear);   // tail: bright at the head, brighter under the probe
  vec3 c = mix(uInk, uSig, vSeen);
  gl_FragColor = vec4(mix(c, abs(c - uBg) * (0.7 + 0.5 * vNear), uToGlow), min(a, 1.0));
}`;
const VS_HEAD = `attribute vec2 aUV; attribute vec4 aA; attribute vec4 aB; uniform float uTime, uN;
varying vec2 vUV; varying float vAlpha, vSeen, vK, vHalf, vNear;
${GLSL_BEND}
void main() {
  float t = uTime - aA.x, far = aB.y;
  float x1 = -20.0 + aA.z * t;
  if (t < 0.0 || x1 - aA.w > uRes.x + 20.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vUV = vec2(0.0); vAlpha = 0.0; vSeen = 0.0; vK = 1.0; vHalf = 1.0; vNear = 0.0; return; }
  float ly = (aA.y + 0.5 - 0.5 * far) * uRes.y / uN;
  float y = ly + bend(x1, ly, far);
  vSeen = step(uSwX, x1);
  vK = clamp((x1 - uSwX) / aA.z / 0.28, 0.0, 1.0);                                      // verification ring, 0..1 over 280 ms
  float ring = (vSeen > 0.5 && vK < 1.0) ? 5.0 + 16.0 * vK : 0.0;
  vHalf = max(ring, 12.0) * mix(1.0, 0.7, far);
  gl_Position = vec4(clip(vec2(x1, y) + aUV * vHalf), 0.0, 1.0);
  vUV = aUV; vAlpha = aB.x * mix(1.0, 0.4, far); vNear = near(vec2(x1, y));
}`;
const FS_HEAD = GLSL_PREC + `varying vec2 vUV; varying float vAlpha, vSeen, vK, vHalf, vNear; uniform vec3 uInk, uSig, uBg; uniform float uAdd, uToGlow;
void main() {
  float d = length(vUV) * vHalf;
  float dot = (1.0 - smoothstep(2.4, 3.4, d)) * (1.0 - uToGlow);                       // the dot itself never persists (it would bead the trail)
  float ring = (vSeen > 0.5 && vK < 1.0) ? (1.0 - smoothstep(0.5, 1.8, abs(d - (3.0 + 16.0 * vK)))) * (1.0 - vK) * 0.9 : 0.0;
  float glow = exp(-d * d / 50.0) * mix(0.12, 0.32, vSeen) * (0.5 + 0.5 * uAdd) * (1.0 + vNear);   // bloom, wider in the additive dark theme, doubled under the probe
  vec3 c = mix(uInk, uSig, vSeen);
  gl_FragColor = vec4(mix(c, abs(c - uBg) * (0.7 + 0.5 * vNear), uToGlow), min((max(dot, ring) + glow) * vAlpha, 1.0));
}`;
// dst *= 1 - k, and the phosphor holds twice as long under the probe
const FS_DECAY = GLSL_PREC + `varying vec2 vXY; uniform float uK;
${GLSL_BEND}
void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, uK * (1.0 - 0.5 * near(vXY))); }`;

function startGL(canvas, { beatMs = 500, lanes = 12, onBeat, onLost, dprCap = 2, persist = true, verified: verified0 = 0 } = {}) {
  // preserveDrawingBuffer only for the reduced-motion still, so the one frame stays readable (and testable) after it is drawn
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power', preserveDrawingBuffer: calm.matches });
  const ext = gl && gl.getExtension('ANGLE_instanced_arrays');
  if (!gl || !ext) return null;
  const CAP = 512, N_UNI = ['uRes', 'uPtr', 'uPtrW', 'uSwX', 'uAge', 'uPar', 'uTime', 'uN', 'uFlash', 'uAdd', 'uBg', 'uMid', 'uInk', 'uSig', 'uSign', 'uGlowW', 'uGlow', 'uToGlow', 'uK'];
  const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const prog = (vs, fs) => {
    const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    ['aUV', 'aA', 'aB'].forEach((n, i) => gl.bindAttribLocation(p, i, n)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}; for (const n of N_UNI) u[n] = gl.getUniformLocation(p, n); return { p, u };
  };
  const buf = (data, usage = gl.STATIC_DRAW) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, usage); return b; };
  let field, body, head, decay, bFull, bStrip, bSquare, bInst;
  try {
    field = prog(VS_FIELD, FS_FIELD); body = prog(VS_BODY, FS_BODY); head = prog(VS_HEAD, FS_HEAD); decay = prog(VS_FIELD, FS_DECAY);
    bFull = buf(new Float32Array([-1, -1, 3, -1, -1, 3]));
    const strip = []; for (let k = 0; k <= 6; k++) strip.push(k / 6, -1, k / 6, 1); bStrip = buf(new Float32Array(strip));
    bSquare = buf(new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]));
  } catch (e) { return null; }
  const inst = new Float32Array(CAP * 8).fill(1e9), seen = new Uint8Array(CAP);
  bInst = buf(inst, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0); gl.enableVertexAttribArray(1); gl.enableVertexAttribArray(2);
  ext.vertexAttribDivisorANGLE(1, 1); ext.vertexAttribDivisorANGLE(2, 1);
  // persistence layer: one RGBA texture at CSS-pixel resolution (a quarter of the pixels at DPR 2), linear so it upsamples soft
  const tex = gl.createTexture(), fbo = gl.createFramebuffer();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  const clearGlow = () => { gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.bindFramebuffer(gl.FRAMEBUFFER, null); };

  let W = 0, H = 0, N = lanes, switchX = 0, par = 0, flash = 0, age = 10, time = 0, live = 0, cursor = 0, dirty = true, verified = verified0;
  // The probe: where the pointer is (px,py follow tx,ty on a spring) and how much it counts (w eases 0..1 in and
  // out, so the lanes notice the pointer arriving and let go when it leaves instead of snapping). `held` while pressed.
  let tx = 0, ty = 0, px = 0, py = 0, w = 0, wT = 0, held = false;
  let col = { bg: [0, 0, 0], mid: [0, 0, 0], ink: [0, 0, 0], sig: [0, 0, 0] }, additive = true;
  const rgb = (s) => { const m = s.match(/[\d.]+/g) || [0, 0, 0]; return [m[0] / 255, m[1] / 255, m[2] / 255]; };
  const recolor = () => {
    const cs = getComputedStyle(root), g = (n) => rgb(cs.getPropertyValue(n));
    col = { bg: g('--c-bg'), mid: g('--c-mid'), ink: g('--c-ink'), sig: g('--c-signal') };
    additive = 0.2126 * col.bg[0] + 0.7152 * col.bg[1] + 0.0722 * col.bg[2] < 0.5;
  };
  const size = () => {
    const r = canvas.getBoundingClientRect(), dpr = Math.min(dprCap, devicePixelRatio || 1);
    W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    N = W < 720 ? Math.max(4, Math.round(lanes / 2)) : lanes; switchX = W < 720 ? W * 0.84 : W * 0.62;
    gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); gl.bindTexture(gl.TEXTURE_2D, null); clearGlow();
  };
  const rnd = (a, b) => a + Math.random() * (b - a);
  // spawn: `far` packets run slower and dimmer on the lanes between the near ones; `pre` scatters them mid-flight;
  // `at` = [x, y] starts them under the pointer on its nearest lane (the click burst and the held pump)
  const spawn = (count, far, pre, at) => {
    const sp = H / N;
    for (let i = 0; i < count && live < CAP - 1; i++) {
      let s = cursor; while (inst[s * 8] < 1e8) s = (s + 1) % CAP;
      cursor = (s + 1) % CAP;
      const v = far ? rnd(140, 240) : rnd(240, 420);
      const lane = at ? Math.min(N - 1, Math.max(far ? 1 : 0, Math.round(at[1] / sp - (far ? 0 : 0.5)))) : far ? 1 + Math.floor(Math.random() * (N - 1)) : Math.floor(Math.random() * N);
      const t0 = at ? time - (at[0] + 20 - rnd(0, 60)) / v : pre ? time - rnd(0, (W + 40) / v) : time + rnd(0, 0.18);
      inst.set([t0, lane, v, rnd(24, 90) * (far ? 0.7 : 1), rnd(0.6, 1), far, 0, 0], s * 8);
      seen[s] = 0; live++; dirty = true;
    }
  };
  const sweep = () => { // count verifications, free packets that left the screen
    for (let i = 0; i < CAP; i++) {
      const o = i * 8, t0 = inst[o]; if (t0 > 1e8) continue;
      const x1 = -20 + inst[o + 2] * (time - t0);
      if (!seen[i] && x1 >= switchX) { seen[i] = 1; verified++; }
      if (x1 - inst[o + 3] > W + 20) { inst[o] = 1e9; live--; dirty = true; }
    }
  };
  const use = (P) => {
    gl.useProgram(P.p); const u = P.u;
    gl.uniform2f(u.uRes, W, H); gl.uniform2f(u.uPtr, px, py); gl.uniform1f(u.uPtrW, w); gl.uniform1f(u.uSwX, switchX); gl.uniform1f(u.uAge, age); gl.uniform1f(u.uPar, par);
    gl.uniform1f(u.uTime, time); gl.uniform1f(u.uN, N); gl.uniform1f(u.uFlash, flash); gl.uniform1f(u.uAdd, additive ? 1 : 0);
    gl.uniform3fv(u.uBg, col.bg); gl.uniform3fv(u.uMid, col.mid); gl.uniform3fv(u.uInk, col.ink); gl.uniform3fv(u.uSig, col.sig);
    gl.uniform1f(u.uSign, additive ? 1 : -1); gl.uniform1f(u.uGlowW, persist ? (additive ? 0.7 : 0.45) : 0); gl.uniform1i(u.uGlow, 0);
  };
  const geom = (b) => { gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); };
  const packets = (toGlow) => {
    use(body); gl.uniform1f(body.u.uToGlow, toGlow); geom(bStrip); ext.drawArraysInstancedANGLE(gl.TRIANGLE_STRIP, 0, 14, CAP);
    use(head); gl.uniform1f(head.u.uToGlow, toGlow); geom(bSquare); ext.drawArraysInstancedANGLE(gl.TRIANGLE_STRIP, 0, 4, CAP);
  };
  const draw = (dt) => {
    if (dirty) { gl.bindBuffer(gl.ARRAY_BUFFER, bInst); gl.bufferSubData(gl.ARRAY_BUFFER, 0, inst); dirty = false; }
    gl.bindBuffer(gl.ARRAY_BUFFER, bInst); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 0); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16);
    if (persist) { // 1. persistence layer: fade what is there by e^(-dt/0.4), add this frame's packets
      gl.bindTexture(gl.TEXTURE_2D, null); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.viewport(0, 0, W, H);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
      use(decay); gl.uniform1f(decay.u.uK, 1 - Math.exp(-dt / 0.4)); geom(bFull); gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE); packets(1);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    // 2. screen: the field composites the layer, crisp full-resolution packets go on top
    gl.viewport(0, 0, canvas.width, canvas.height); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.disable(gl.BLEND); use(field); geom(bFull); gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, additive ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA); packets(0);
  };

  recolor(); size();
  const still = calm.matches;
  const seedCount = () => Math.max(6, Math.round(N * 2));
  let io = null, paused = false, lost = false, raf = 0, last = 0, onScreen = true, beatIdx = 0, tBeat = 0, trickle = 0;
  const ro = new ResizeObserver(() => { size(); if (still) { inst.fill(1e9); live = 0; spawn(seedCount(), 0, true); spawn(seedCount() - 4, 1, true); sweep(); draw(0); } });
  ro.observe(canvas);
  const api = {
    pause() { paused = true; }, resume() { paused = false; go(); }, burst() { spawn(8, 0); spawn(4, 1); flash = 1; age = 0; go(); },
    recolor: () => { recolor(); if (still) { clearGlow(); draw(0); } }, paused: () => paused, verified: () => verified, mode: 'webgl',
    lose() { gl.getExtension('WEBGL_lose_context')?.loseContext(); }, // test hook: forces the context-loss path
    dispose() { paused = true; ro.disconnect(); io?.disconnect(); if (raf) cancelAnimationFrame(raf); raf = 0; },
  };
  // No preventDefault: we do not want the context back, we want the 2D trace to take over for good.
  canvas.addEventListener('webglcontextlost', () => { if (lost) return; lost = true; api.dispose(); onLost?.(verified, api.paused()); });

  if (still) { // static frame: packets mid-flight, nothing moves, no clock
    spawn(seedCount(), 0, true); spawn(seedCount() - 4, 1, true); sweep(); draw(0);
    api.pause = api.resume = api.burst = () => {}; api.paused = () => true;
    return api;
  }
  const frame = (now) => {
    raf = 0;
    if (paused || !onScreen || document.hidden || lost) { last = 0; return; }
    const dt = last ? Math.max(0, Math.min(0.05, (now - last) / 1000)) : 0; last = now;   // both ways: a negative delta runs the beat and the packets backwards
    time += dt; tBeat += dt * 1000; age += dt;
    // performance.now()-driven, never setInterval: a dropped frame must not drift the beat
    const idx = Math.floor(tBeat / beatMs);
    if (idx !== beatIdx) {
      beatIdx = idx; flash = 1; age = 0; spawn(W < 720 ? 4 : 8, 0); spawn(W < 720 ? 3 : 6, 1); onBeat?.();
      if (held) { spawn(3, 0, false, [tx, ty]); spawn(2, 1, false, [tx, ty]); }   // held: the pump fires on the beat, from under the pointer
    }
    trickle += dt; if (trickle > 0.09) { trickle = 0; spawn(1, 0); spawn(1, 1); } // steady background traffic between bursts
    flash = Math.max(0, flash - dt / 0.3);
    const k = Math.min(1, dt * 12);
    px += (tx - px) * k; py += (ty - py) * k; w += (wT - w) * Math.min(1, dt * (wT > w ? 10 : 5));
    par += ((py - H / 2) * 0.03 * w - par) * Math.min(1, dt * 6);                    // far layer drifts with the pointer, springy
    sweep(); draw(dt);
    raf = requestAnimationFrame(frame);
  };
  const go = () => { if (!raf && !lost) raf = requestAnimationFrame(frame); };
  io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; if (onScreen) go(); }, { threshold: 0.05 });
  io.observe(canvas);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) go(); });
  // Pointer events come from the hero section, not the canvas: the canvas sits at z-index -1 under the name, the
  // copy and the ledger, so it only ever saw the padding strip. Nothing is prevented, so touch still scrolls.
  const host = canvas.parentElement;
  const at = (e) => { const r = canvas.getBoundingClientRect(); tx = e.clientX - r.left; ty = e.clientY - r.top; };
  host.addEventListener('pointermove', (e) => { at(e); if (w < 0.05) { px = tx; py = ty; } wT = 1; }, { passive: true });
  host.addEventListener('pointerleave', () => { wT = 0; held = false; });
  host.addEventListener('pointerdown', (e) => {
    if (e.target.closest('a, button') || e.button > 0) return;
    at(e); if (w < 0.05) { px = tx; py = ty; } wT = 1; held = true;
    spawn(W < 720 ? 6 : 10, 0, false, [tx, ty]); spawn(4, 1, false, [tx, ty]); flash = 1; age = 0;
  }, { passive: true });
  const release = (e) => { held = false; if (e.pointerType !== 'mouse') wT = 0; };   // a finger lifting is a pointer leaving
  host.addEventListener('pointerup', release); host.addEventListener('pointercancel', release);
  spawn(seedCount(), 0, true); spawn(seedCount() - 4, 1, true); go();
  return api;
}

/* ---------- the trace, 2D fallback ----------
   Canvas 2D, same drawing without the phosphor. Takes over when WebGL is missing, blocked, fails to
   compile, or the context is lost. */
function start2D(canvas, { beatMs = 500, lanes: laneCount = 12, onBeat, verified: verified0 = 0 } = {}) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1, lanes = [], packets = [], ticks = [], px = -1e9, py = -1e9, switchX = 0, flash = 0, verified = verified0, trickle = 0;
  let col = {};
  const recolor = () => {
    const cs = getComputedStyle(root);
    col = { mid: cs.getPropertyValue('--c-mid').trim(), ink: cs.getPropertyValue('--c-ink').trim(), sig: cs.getPropertyValue('--c-signal').trim() };
  };
  const size = () => {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(2, devicePixelRatio || 1);
    W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = W < 720 ? Math.max(4, Math.round(laneCount / 2)) : laneCount;
    lanes = Array.from({ length: n }, (_, i) => ({ y: H * (i + 0.5) / n }));
    switchX = W < 720 ? W * 0.84 : W * 0.62;
  };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const spawn = (count, at) => { // `at` = [x, y]: start under the pointer on its nearest lane
    for (let i = 0; i < count && packets.length < 400; i++) {
      const lane = at ? lanes[Math.min(lanes.length - 1, Math.max(0, Math.round(at[1] / (H / lanes.length) - 0.5)))] : lanes[Math.floor(Math.random() * lanes.length)];
      packets.push({ lane, x: at ? at[0] - rnd(0, 60) : rnd(-90, -20), len: rnd(24, 90), v: rnd(240, 420), a: rnd(0.6, 1), seen: false });
    }
  };
  // lane bend: a spring toward the pointer, strongest right under it, max 24 px
  const bend = (x, lane) => {
    const dx = (x - px) / 220, g = Math.exp(-dx * dx);
    return Math.max(-24, Math.min(24, (py - lane.y) * 0.15)) * g;
  };
  const yAt = (x, lane) => lane.y + bend(x, lane);
  const draw = (dt) => {
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = 'round';
    ctx.strokeStyle = col.mid; ctx.globalAlpha = 0.14; ctx.lineWidth = 1;
    for (const lane of lanes) {
      ctx.beginPath();
      for (let x = 0; x <= W; x += 24) { const y = yAt(x, lane); x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
      ctx.stroke();
    }
    ctx.globalAlpha = 0.06 + 0.2 * flash; ctx.fillStyle = col.sig; ctx.fillRect(switchX - 14 - 30 * flash, 0, 28 + 60 * flash, H);
    ctx.globalAlpha = 0.45 + 0.55 * flash; ctx.strokeStyle = col.sig; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(switchX, 0); ctx.lineTo(switchX, H); ctx.stroke();
    ctx.lineWidth = 2.5;
    for (const p of packets) {
      p.x += p.v * dt;
      if (!p.seen && p.x >= switchX) { p.seen = true; verified++; ticks.push({ x: switchX, y: yAt(switchX, p.lane), t: 0 }); }
      const x0 = p.x - p.len, x1 = p.x;
      ctx.strokeStyle = p.seen ? col.sig : col.ink; ctx.globalAlpha = p.a * (p.seen ? 0.95 : 0.8);
      ctx.beginPath(); ctx.moveTo(x0, yAt(x0, p.lane)); ctx.lineTo((x0 + x1) / 2, yAt((x0 + x1) / 2, p.lane)); ctx.lineTo(x1, yAt(x1, p.lane)); ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.arc(x1, yAt(x1, p.lane), 3, 0, 6.28); ctx.fill();
    }
    packets = packets.filter((p) => p.x - p.len < W + 10);
    for (const t of ticks) { // verification tick: a ring that blooms and fades in 280 ms
      t.t += dt; const k = Math.min(1, t.t / 0.28);
      ctx.globalAlpha = (1 - k) * 0.9; ctx.strokeStyle = col.sig; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(t.x, t.y, 3 + 16 * k, 0, 6.28); ctx.stroke();
    }
    ticks = ticks.filter((t) => t.t < 0.28);
    ctx.lineWidth = 2.5;
    ctx.globalAlpha = 1;
  };

  recolor(); size();
  const still = calm.matches;
  const ro = new ResizeObserver(() => { size(); if (still) { for (const p of packets) p.x = rnd(0, W); draw(0); } }); ro.observe(canvas);

  if (still) { // static frame: packets mid-flight, nothing moves, no clock
    spawn(36); for (const p of packets) { p.x = rnd(0, W); p.seen = p.x >= switchX; }
    draw(0);
    return { pause() {}, resume() {}, burst() {}, recolor: () => { recolor(); draw(0); }, dispose() { ro.disconnect(); }, paused: () => true, verified: () => verified0 + packets.filter((p) => p.seen).length, mode: '2d' };
  }

  let raf = 0, last = 0, paused = false, onScreen = true, beatIdx = 0, tBeat = 0;
  const frame = (now) => {
    raf = 0;
    if (paused || !onScreen || document.hidden) { last = 0; return; }
    const dt = last ? Math.max(0, Math.min(0.05, (now - last) / 1000)) : 0; last = now;   // both ways: a negative delta runs the beat and the packets backwards
    tBeat += dt * 1000;
    const idx = Math.floor(tBeat / beatMs);
    if (idx !== beatIdx) { beatIdx = idx; flash = 1; spawn(W < 720 ? 4 : 8); onBeat?.(); }
    trickle += dt; if (trickle > 0.09) { trickle = 0; spawn(1); }
    flash = Math.max(0, flash - dt / 0.3);
    draw(dt);
    raf = requestAnimationFrame(frame);
  };
  const go = () => { if (!raf) raf = requestAnimationFrame(frame); };
  const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; if (onScreen) go(); }, { threshold: 0.05 });
  io.observe(canvas);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) go(); });
  const host = canvas.parentElement; // the section, not the canvas: see startGL
  const at = (e) => { const r = canvas.getBoundingClientRect(); px = e.clientX - r.left; py = e.clientY - r.top; };
  host.addEventListener('pointermove', at, { passive: true });
  host.addEventListener('pointerleave', () => { px = py = -1e9; });
  host.addEventListener('pointerdown', (e) => { if (e.target.closest('a, button') || e.button > 0) return; at(e); spawn(W < 720 ? 6 : 10, [px, py]); flash = 1; }, { passive: true });
  spawn(24); for (const p of packets) p.x = rnd(0, W); go();
  return {
    pause() { paused = true; }, resume() { paused = false; go(); }, burst() { spawn(8); flash = 1; },
    recolor, dispose() { paused = true; ro.disconnect(); io.disconnect(); }, paused: () => paused, verified: () => verified, mode: '2d',
  };
}

/** Start the trace on `canvas`, falling back to `opts.fallback` (a second canvas) if WebGL cannot
 *  run or is lost mid-visit. Returns a stable facade whose `mode` reflects whichever is drawing. */
export function start(canvas, opts = {}) {
  const fire = () => { canvas.dispatchEvent(new CustomEvent('trace-beat')); opts.onBeat?.(); };
  const inner = { ...opts, onBeat: fire };
  let impl = null;
  const fallback = (verified = 0, wasPaused = false) => {
    const c2d = opts.fallback;
    if (!c2d) return; // no fallback canvas on the page: the hero is simply still
    canvas.classList.add('off'); c2d.classList.remove('off');
    impl = start2D(c2d, { ...inner, verified });
    if (wasPaused) impl.pause();
  };
  impl = startGL(canvas, { ...inner, onLost: fallback });
  if (!impl) { fallback(); }
  if (!impl) impl = { pause() {}, resume() {}, burst() {}, recolor() {}, dispose() {}, paused: () => true, verified: () => 0, mode: 'none' };
  /* A press on the hero is a play with the trace, not the start of a text selection, so selection is
   * off only while a press lasts. Permanent user-select: none would also stop anyone copying the name
   * and the lede; this way select-all and copy still carry them. Released on the window, since a drag
   * can end anywhere. */
  const host = canvas.parentElement;
  const unpress = () => host.classList.remove('pressing');
  host.addEventListener('pointerdown', (e) => {
    // under reduced motion the trace is a still picture, so a drag there is a reader selecting text
    if (calm.matches || e.button > 0 || e.target.closest('a, button, input, textarea')) return;
    host.classList.add('pressing');
  }, { passive: true });
  addEventListener('pointerup', unpress); addEventListener('pointercancel', unpress);
  return {
    pause: () => impl.pause(), resume: () => impl.resume(), burst: () => impl.burst(), recolor: () => impl.recolor(),
    dispose: () => impl.dispose(), paused: () => impl.paused(), verified: () => impl.verified(),
    lose: () => impl.lose?.(), get mode() { return impl.mode; },
  };
}
