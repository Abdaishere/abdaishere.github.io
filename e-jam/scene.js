/* The traffic figure on /e-jam/, part two: the packets.
 *
 * Descended from the v2 home page's hero scene. The shader that flies a point along a bent path
 * and brightens it as it crosses the switch is the same one, and so is the perf guard that halves
 * its own resolution rather than hand you a slideshow. What changed is the job. That scene was
 * atmosphere: a cloud of points around a ring. This one is a figure with something to say, so it
 * runs on the diagram's coordinates (diagram.js), along the lanes a reader can see and between
 * nodes a reader can read the names of.
 *
 * Three things it shows that the paragraph above it cannot:
 *   - traffic has structure. Every packet belongs to a stream and travels that stream's lane.
 *   - the switch stamps. Each packet turns amber for the instant it is inside the switch: that
 *     stamp is the timestamp the verifier prices the delay from.
 *   - frames go missing. A small, fixed share never comes out the far side, and the verifier's
 *     tally is what notices. Frame loss is one of the three RFC 2544 measurements.
 *
 * three.js pinned: 0.185.1, self-hosted in /vendor/. Loaded only by the page's boot, which waits
 * for the figure to be on screen. The camera is orthographic and frames the diagram's viewBox
 * exactly, so a packet at rest sits on its lane to the pixel.
 */
import * as THREE from '/vendor/three.module.min.js';
import { LAYOUT, stream, prng, freshState } from './diagram.js';

const BEAT = 0.5;        // seconds per beat, 120 BPM, the same clock as the rest of the site
const CYCLE = 4 * BEAT;  // a packet's whole trip, so one wave crosses the switch every beat

export function start(canvas, { lowPower = false, key = 'wide', onCount = null, state = freshState(), from = null } = {}) {
  const L = LAYOUT[key];
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowPower, alpha: true, powerPreference: 'low-power' });
  let dprCap = lowPower ? 1.5 : 1.75;
  const scene = new THREE.Scene();
  // Orthographic and y-up: world x is the diagram's x, world y is its height minus the diagram's y.
  const camera = new THREE.OrthographicCamera(0, L.w, L.h, 0, -1000, 1000);
  const up = (p) => new THREE.Vector3(p.x, L.h - p.y, 0);

  const DROP = 0.018;  // the share of frames this switch does not forward. Chosen to be visible
                       // once every few seconds, not measured: no drop rate for E-Jam exists.
  let perStream = lowPower ? 70 : 150;

  const uniforms = {
    uTime: { value: 0 }, uBurst: { value: 9 }, uScale: { value: 1 },
    uCold: { value: new THREE.Color() }, uWarm: { value: new THREE.Color() },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: `
      attribute vec3 aMid; attribute vec3 aEnd; attribute vec4 aData; // phase, size, dropped, spare
      attribute vec2 aOn;                                             // generator live, verifier live
      uniform float uTime, uBurst, uScale; varying float vAlpha; varying float vWarm;
      void main() {
        float t = fract(uTime / ${CYCLE.toFixed(1)} + aData.x);
        vec3 p = t < 0.5 ? mix(position, aMid, t * 2.0) : mix(aMid, aEnd, (t - 0.5) * 2.0);
        float pass = exp(-70.0 * (t - 0.5) * (t - 0.5));          // 1.0 while inside the switch
        float fade = smoothstep(0.0, 0.05, t) * smoothstep(1.0, 0.95, t);
        float alive = 1.0 - aData.z * smoothstep(0.47, 0.55, t);  // a dropped frame never leaves
        // No verifier on the far end: the packet still crosses, then goes out unaccounted for
        // rather than landing. Nothing catches it, which is what the tally is about to say.
        float tail = mix(smoothstep(1.0, 0.8, t), 1.0, aOn.y);
        vAlpha = fade * alive * (0.55 + 0.45 * pass) * aOn.x * tail;
        vWarm = pass;                                             // amber only inside the switch
        gl_PointSize = aData.y * (1.0 + 0.85 * pass + 1.2 * exp(-3.0 * uBurst)) * uScale;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uCold, uWarm; varying float vAlpha; varying float vWarm;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.16, d) * vAlpha;
        if (a < 0.01) discard;
        gl_FragColor = vec4(mix(uCold, uWarm, vWarm), a);
      }`,
  });

  /* One point per packet. A packet keeps its stream for life: it is born at that stream's
   * generator, crosses the switch, and lands at that stream's verifier, spread a little off the
   * centre line so a lane reads as traffic rather than as a wire. */
  // How many packets each stream carries and how many of those this switch will not forward.
  // Per stream, not one global figure, so the loss a reader sees is the loss of the streams that
  // are actually running.
  let nPer = [], dPer = [], onAttr = null;
  function build(n) {
    const total = n * L.rows.length;
    const pos = new Float32Array(total * 3), mid = new Float32Array(total * 3), end = new Float32Array(total * 3), data = new Float32Array(total * 4);
    const on = new Float32Array(total * 2);
    const rnd = prng(20260928);
    const spread = L.h * 0.03, put = (arr, i, v) => { arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = 0; };
    nPer = []; dPer = [];
    let i = 0;
    L.rows.forEach((_, s) => {
      const g = stream(L, s), a = up(g.a), b = up(g.b), c = up(g.c);
      const gOn = state.gen[s] ? 1 : 0, vOn = state.ver[s] ? 1 : 0;
      let d = 0;
      for (let k = 0; k < n; k++, i++) {
        const off = (rnd() - 0.5) * spread, offB = (rnd() - 0.5) * spread;
        put(pos, i, { x: a.x, y: a.y + off });
        put(mid, i, { x: c.x + (rnd() - 0.5) * spread * 0.9, y: c.y + (rnd() - 0.5) * spread * 0.9 });
        put(end, i, { x: b.x, y: b.y + offB });
        const lost = rnd() < DROP ? 1 : 0;
        d += lost;
        // phases quantised to quarter cycles so the traffic still pulses on the beat, with enough
        // scatter that a lane reads as a stream of frames rather than four marching blocks
        data.set([((rnd() * 4) | 0) / 4 + (rnd() - 0.5) * 0.17, 3.4 + rnd() * 3.2, lost, 0], i * 4);
        on[i * 2] = gOn; on[i * 2 + 1] = vOn;
      }
      nPer.push(n); dPer.push(d);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aMid', new THREE.BufferAttribute(mid, 3));
    geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 3));
    geo.setAttribute('aData', new THREE.BufferAttribute(data, 4));
    onAttr = new THREE.BufferAttribute(on, 2);
    geo.setAttribute('aOn', onAttr);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(L.w / 2, L.h / 2, 0), L.w);
    return geo;
  }

  /* Switching a node is two floats per packet on one stream and a re-upload of a 4.8 KB buffer.
   * Nothing is rebuilt, so the traffic already in flight keeps flying and the counters keep their
   * place: a reader turning a generator off is stopping a stream, not resetting the figure. */
  function setState(next) {
    state = next;
    const a = onAttr.array;
    let i = 0;
    L.rows.forEach((_, s) => {
      const g = state.gen[s] ? 1 : 0, v = state.ver[s] ? 1 : 0;
      for (let k = 0; k < nPer[s]; k++, i++) { a[i * 2] = g; a[i * 2 + 1] = v; }
    });
    onAttr.needsUpdate = true;
    if (!raf) renderer.render(scene, camera);   // the figure is paused or off screen: show it anyway
  }
  const points = new THREE.Points(build(perStream), material);
  scene.add(points);

  /* The switch, and the one thing here that is actually three-dimensional: a hexagonal prism
   * turning on its axis. Everything else is a diagram and holds still, which is what a diagram
   * is for; the device under test is allowed to look like an object. */
  const prismMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.6 });
  const prism = new THREE.Group();
  prism.position.set(L.sw.x, L.h - L.sw.y, 0);
  {
    const r = L.sw.r[0], d = L.sw.r[0] * 0.42, pts = [];
    const ring = (z) => Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 3) * i - Math.PI / 6; return new THREE.Vector3(r * Math.cos(a), r * Math.sin(a), z); });
    const f = ring(d), k = ring(-d);
    for (let i = 0; i < 6; i++) {
      pts.push(f[i], f[(i + 1) % 6], k[i], k[(i + 1) % 6], f[i], k[i]);
    }
    prism.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), prismMat));
  }
  scene.add(prism);

  let raf = 0, visible = true, last = performance.now(), time = 0, frames = 0, acc = -1, strikes = 0, beat = -1;
  // acc starts at -1 so the first second (shader compile, first upload) is not judged.

  function applyTheme() {
    const cs = getComputedStyle(document.documentElement);
    const c = (n) => new THREE.Color(cs.getPropertyValue(n).trim());
    const bg = c('--c-bg');
    const dark = 0.2126 * bg.r + 0.7152 * bg.g + 0.0722 * bg.b < 0.5;
    uniforms.uCold.value = c('--c-mid'); uniforms.uWarm.value = c('--c-signal');
    material.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
    material.needsUpdate = true;
    prismMat.color = c('--c-signal');
    if (!raf) renderer.render(scene, camera);
  }
  applyTheme();
  const themeWatch = new MutationObserver(applyTheme);
  themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const schemeMq = matchMedia('(prefers-color-scheme: dark)');
  schemeMq.addEventListener('change', applyTheme);

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(Math.min(devicePixelRatio, dprCap));
    renderer.setSize(w, h, false);
    // The canvas and the <svg> under it are the same box with the same aspect, so the camera can
    // frame the viewBox flat out; a packet lands on its drawn lane at every size.
    uniforms.uScale.value = renderer.getPixelRatio() * (w / L.w);
    if (!raf) renderer.render(scene, camera);
  }
  const ro = new ResizeObserver(resize); ro.observe(canvas); resize();

  const host = canvas.closest('.model') || canvas.parentElement;
  const onDown = (e) => { if (!e.target.closest('a,button')) uniforms.uBurst.value = 0; };
  host.addEventListener('pointerdown', onDown, { passive: true });

  const api = { fps: 0, state: 'running', packets: perStream * L.rows.length, paused: false, setPaused, setState, dispose, counts: () => counts(),
    streams: () => ({ n: nPer.slice(), d: dPer.slice() }) };  // per-stream packets and drops, for the gate

  /* What the verifiers have checked, counted off the same clock the packets fly on rather than by
   * watching them: every packet completes exactly one trip per cycle, so the arithmetic is exact
   * and costs nothing.
   *
   * Accumulated rather than derived from the elapsed time, because what is running changes while
   * the reader watches, and a figure from `time` alone would rewrite history every time a node was
   * switched. Each frame adds only what the streams that are on during that frame carried:
   *   - generator off: nothing is sent down that lane, so nothing is counted, lost least of all.
   *   - generator on, verifier on: its drop share lands as lost, the rest as verified.
   *   - generator on, verifier off: the packets cross and nobody checks them, so all of them land
   *     as lost. That is what a verifier is for, and it is the one thing this figure can show.
   * dt is clamped non-negative where it is born, so both accumulators only ever climb, and with
   * everything switched off they simply stop. Nothing here can run backwards or go under zero.
   *
   * Sent is reported as lost + verified rather than accumulated a third time: the identity a
   * reader can check on screen then holds exactly, at every combination, including mid-flight. */
  // `from` carries the tally across a rebuild at the breakpoint: "since you arrived" stays true.
  const seen = { lost: Math.max(0, from?.lost || 0), verified: Math.max(0, from?.verified || 0) };
  function tally(dt) {
    const laps = dt / CYCLE;
    for (let s = 0; s < L.rows.length; s++) {
      if (!state.gen[s]) continue;
      if (state.ver[s]) { seen.lost += dPer[s] * laps; seen.verified += (nPer[s] - dPer[s]) * laps; }
      else seen.lost += nPer[s] * laps;
    }
  }
  const counts = () => {
    const lost = Math.floor(seen.lost), verified = Math.floor(seen.verified);
    return { sent: lost + verified, lost, verified };
  };
  let told = 0;

  function frame(now) {
    raf = 0;
    // Clamped both ways. A rAF timestamp can precede the performance.now() schedule() captured
    // (tab restore, device sleep, a debugger pause, a clock adjustment), and one negative dt drives
    // `time` backwards: counts() then floors a negative lap count straight onto the page, and the
    // perf guard's `acc` stops climbing so it never judges a window. Guard it where dt is born.
    const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = now;
    time += dt; uniforms.uTime.value = time; uniforms.uBurst.value += dt;
    tally(dt);
    if (Math.floor(time / BEAT) !== beat) { beat = Math.floor(time / BEAT); canvas.dispatchEvent(new CustomEvent('scene-beat')); }
    const beatPhase = (time % BEAT) / BEAT;
    prism.rotation.y += 0.32 * dt;
    prism.scale.setScalar(1 + 0.05 * Math.exp(-6 * beatPhase) + 0.12 * Math.exp(-3 * uniforms.uBurst.value));
    renderer.render(scene, camera);

    if (onCount && now - told > 240) { told = now; onCount(counts()); }

    // Perf guard: judge ~2 s windows; first drop resolution and packets, then hand the figure back
    // to the still diagram rather than show a slideshow over it.
    frames++; acc += dt;
    if (acc >= 2) {
      api.fps = Math.round(frames / acc);
      const slow = api.fps < 27;                 // below a 30 fps battery-saver cap, not just capped
      if (!slow && strikes > 1) strikes = 1;     // only consecutive slow windows count toward giving up
      if (slow) {
        strikes++;
        if (strikes === 1) { dprCap = 1; perStream = Math.round(perStream / 2); points.geometry.dispose(); points.geometry = build(perStream); api.packets = perStream * L.rows.length; resize(); }
        else if (strikes >= 3) { api.state = 'fallback'; canvas.dispatchEvent(new CustomEvent('scene-fallback', { bubbles: true })); dispose(); return; }
      }
      frames = 0; acc = 0;
    }
    if (running()) raf = requestAnimationFrame(frame);
  }
  const running = () => visible && !api.paused && !document.hidden && api.state === 'running';
  function schedule() { if (!raf && running()) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  function setPaused(p) { api.paused = p; schedule(); }
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; schedule(); });
  io.observe(canvas);
  document.addEventListener('visibilitychange', schedule);

  // A lost context is silent: the loop keeps running at 60 and draws nothing, over a diagram whose
  // still packets have already been faded out. Treat it as giving up, and let the page restore them.
  const onLost = (e) => {
    e.preventDefault();
    if (api.state !== 'running') return;
    api.state = 'fallback'; dispose();
    canvas.dispatchEvent(new CustomEvent('scene-fallback', { bubbles: true }));
  };
  canvas.addEventListener('webglcontextlost', onLost);

  function dispose() {
    if (api.state === 'running') api.state = 'disposed';
    cancelAnimationFrame(raf); io.disconnect(); ro.disconnect(); themeWatch.disconnect();
    schemeMq.removeEventListener('change', applyTheme);
    document.removeEventListener('visibilitychange', schedule);
    host.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('webglcontextlost', onLost);
    scene.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
    renderer.dispose();
  }

  renderer.render(scene, camera);
  schedule();
  return api;
}
