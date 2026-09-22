// Hero scene: traffic generators -> switch under test -> verifiers, packets fired on a 120 BPM beat.
// Loaded lazily by index.html only when motion is allowed and WebGL exists. three.js pinned: 0.185.1 (self-hosted).
import * as THREE from './vendor/three.module.min.js';

const BEAT = 0.5;          // seconds per beat (120 BPM)
const CYCLE = 4 * BEAT;    // a packet's full trip lasts four beats, so a wave crosses the switch on every beat

export function start(canvas, { lowPower = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowPower, alpha: true, powerPreference: 'high-performance' });
  let dprCap = lowPower ? 1.5 : 1.75;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 50);
  camera.position.set(0, 0.5, 9.5);
  const world = new THREE.Group();
  scene.add(world);

  // Seeded PRNG so the layout is the same on every load (and matches the static poster's idea).
  let seed = 20260922;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

  const NODES = 14; // per side
  const gens = [], vers = [];
  for (let i = 0; i < NODES; i++) {
    const a = (i / NODES) * Math.PI * 2, r = 1.2 + rnd() * 1.5;
    gens.push(new THREE.Vector3(-3.1 - rnd() * 1.9, Math.cos(a) * r, Math.sin(a) * r));
    const b = a + 0.4, q = 1.2 + rnd() * 1.5;
    vers.push(new THREE.Vector3(3.1 + rnd() * 1.9, Math.cos(b) * q, Math.sin(b) * q));
  }

  const uniforms = {
    uTime: { value: 0 }, uBurst: { value: 9 }, uScale: { value: 1 },
    uCold: { value: new THREE.Color() }, uWarm: { value: new THREE.Color() }, uAlpha: { value: 1 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: `
      attribute vec3 aMid; attribute vec3 aEnd; attribute vec4 aData; // offset, size, warm, isNode
      uniform float uTime, uBurst, uScale; varying float vAlpha; varying float vWarm;
      void main() {
        float t = fract(uTime / ${CYCLE.toFixed(1)} + aData.x);
        vec3 p = t < 0.5 ? mix(position, aMid, t * 2.0) : mix(aMid, aEnd, (t - 0.5) * 2.0);
        float pass = exp(-40.0 * (t - 0.5) * (t - 0.5));           // brighten while crossing the switch
        float fade = smoothstep(0.0, 0.08, t) * smoothstep(1.0, 0.92, t);
        vAlpha = mix(fade * (0.55 + 0.45 * pass), 1.0, aData.w);
        vWarm = aData.z;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float boost = 1.0 + (1.0 - aData.w) * (0.8 * pass + 1.4 * exp(-3.0 * uBurst));
        gl_PointSize = aData.y * boost * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uCold, uWarm; uniform float uAlpha; varying float vAlpha; varying float vWarm;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.18, d) * vAlpha * uAlpha;
        if (a < 0.01) discard;
        gl_FragColor = vec4(mix(uCold, uWarm, vWarm), a);
      }`,
  });

  function buildPoints(packetCount) {
    const n = packetCount + NODES * 2;
    const pos = new Float32Array(n * 3), mid = new Float32Array(n * 3), end = new Float32Array(n * 3), data = new Float32Array(n * 4);
    const put = (arr, i, v) => { arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z; };
    const m = new THREE.Vector3();
    for (let i = 0; i < packetCount; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 0.7;
      put(pos, i, gens[(rnd() * NODES) | 0]); put(mid, i, m.set(0, Math.cos(a) * r, Math.sin(a) * r)); put(end, i, vers[(rnd() * NODES) | 0]);
      // offsets quantised to quarter cycles: packets travel in trains that hit the switch exactly on the beat
      data.set([((rnd() * 4) | 0) / 4 + (rnd() - 0.5) * 0.07, 26 + rnd() * 30, rnd() < 0.22 ? 1 : 0, 0], i * 4);
    }
    [...gens, ...vers].forEach((v, k) => {
      const i = packetCount + k;
      put(pos, i, v); put(mid, i, v); put(end, i, v);
      data.set([0, 95, 0, 1], i * 4);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aMid', new THREE.BufferAttribute(mid, 3));
    g.setAttribute('aEnd', new THREE.BufferAttribute(end, 3));
    g.setAttribute('aData', new THREE.BufferAttribute(data, 4));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 8);
    return g;
  }
  let packetCount = lowPower ? 260 : 640; // well under the 3000 mobile baseline
  const points = new THREE.Points(buildPoints(packetCount), material);
  world.add(points);

  // Links from every node to the switch.
  const linkPos = [];
  [...gens, ...vers].forEach((v) => linkPos.push(v.x, v.y, v.z, 0, 0, 0));
  const linkGeo = new THREE.BufferGeometry();
  linkGeo.setAttribute('position', new THREE.Float32BufferAttribute(linkPos, 3));
  const linkMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.16, depthWrite: false });
  world.add(new THREE.LineSegments(linkGeo, linkMat));

  // The switch: nested polygon rings (a nod to PolyBall), facing the traffic.
  const rings = [6, 6, 12].map((sides, k) => {
    const pts = [];
    for (let i = 0; i < sides; i++) { const a = (i / sides) * Math.PI * 2; pts.push(new THREE.Vector3(0, Math.cos(a), Math.sin(a))); }
    const mat = new THREE.LineBasicMaterial({ transparent: true, opacity: [1, 0.55, 0.3][k], depthWrite: false });
    const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), mat);
    ring.userData = { r: [1.05, 1.4, 1.85][k], spin: [0.22, -0.14, 0.08][k] };
    world.add(ring);
    return ring;
  });

  // Theme: colours come from CSS custom properties so light and dark stay coherent with the page.
  function applyTheme() {
    const cs = getComputedStyle(document.documentElement);
    const c = (name) => new THREE.Color(cs.getPropertyValue(name).trim());
    const dark = cs.getPropertyValue('--scene-additive').trim() === '1';
    uniforms.uCold.value = c('--scene-packet'); uniforms.uWarm.value = c('--scene-beat');
    material.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
    material.needsUpdate = true;
    linkMat.color = c('--scene-line');
    rings.forEach((r, k) => { r.material.color = c(k === 0 ? '--scene-beat' : '--scene-line'); });
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
    camera.aspect = w / h; camera.updateProjectionMatrix();
    const wide = w / h > 1.25;
    world.position.x = wide ? 2.7 : 0;
    world.scale.setScalar(wide ? 1 : Math.max(0.55, Math.min(1, (w / h) * 0.95)));
    uniforms.uScale.value = renderer.getPixelRatio() * Math.max(0.8, h / 800) * Math.sqrt(world.scale.x);
  }
  const ro = new ResizeObserver(resize); ro.observe(canvas); resize();

  // Pointer parallax (mouse + touch via pointer events); click or tap fires a burst.
  const target = { x: 0, y: 0 }, host = canvas.closest('.hero');
  const onMove = (e) => { target.x = (e.clientX / innerWidth - 0.5) * 2; target.y = (e.clientY / innerHeight - 0.5) * 2; };
  const onDown = (e) => { if (!e.target.closest('a,button')) uniforms.uBurst.value = 0; };
  host.addEventListener('pointermove', onMove, { passive: true });
  host.addEventListener('pointerdown', onDown, { passive: true });

  const api = { fps: 0, state: 'running', packets: packetCount, paused: false, setPaused, dispose };
  let raf = 0, visible = true, last = performance.now(), time = 0, frames = 0, acc = 0, strikes = 0;

  function frame(now) {
    raf = 0;
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    time += dt; uniforms.uTime.value = time; uniforms.uBurst.value += dt;
    const beatPhase = (time % BEAT) / BEAT;
    const pulse = 1 + 0.09 * Math.exp(-6 * beatPhase) + 0.18 * Math.exp(-3 * uniforms.uBurst.value);
    rings.forEach((r) => { r.scale.setScalar(r.userData.r * pulse); r.rotation.x += r.userData.spin * dt; });
    world.rotation.y += ((-0.55 + target.x * 0.22) - world.rotation.y) * Math.min(1, dt * 3);
    world.rotation.x += ((0.12 + target.y * 0.12) - world.rotation.x) * Math.min(1, dt * 3);
    renderer.render(scene, camera);

    // Perf guard: judge ~2 s windows; first drop resolution and packets, then give the stage back to the poster.
    frames++; acc += dt;
    if (acc >= 2) {
      api.fps = Math.round(frames / acc);
      if (api.fps < 40 && ++strikes) {
        if (strikes === 1) { dprCap = 1; packetCount = Math.round(packetCount / 2); points.geometry.dispose(); points.geometry = buildPoints(packetCount); api.packets = packetCount; resize(); }
        else if (strikes >= 3) { api.state = 'fallback'; canvas.dispatchEvent(new CustomEvent('scene-fallback', { bubbles: true })); dispose(); return; }
      }
      frames = 0; acc = 0;
    }
    schedule();
  }
  function schedule() { if (!raf && visible && !api.paused && !document.hidden && api.state === 'running') { last = performance.now(); raf = requestAnimationFrame(frame); } }
  function setPaused(p) { api.paused = p; schedule(); }
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; schedule(); });
  io.observe(canvas);
  document.addEventListener('visibilitychange', schedule);

  function dispose() {
    cancelAnimationFrame(raf); io.disconnect(); ro.disconnect(); themeWatch.disconnect();
    schemeMq.removeEventListener('change', applyTheme);
    document.removeEventListener('visibilitychange', schedule);
    host.removeEventListener('pointermove', onMove); host.removeEventListener('pointerdown', onDown);
    scene.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
    renderer.dispose();
  }

  renderer.render(scene, camera);
  schedule();
  return api;
}
