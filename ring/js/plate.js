/* Side 5, the build plate. Loaded when side 5 comes near, and only then is the G-code fetched.
 *
 * The Panamera's real toolpaths (assets/plate.json, packed from assets/ring/plate-panamera-layers.json
 * by tests/tools/pack-plate.mjs) are laid bottom up in painter's order, in the same oblique view and
 * colours as ring/plate_rise.py: red base to the colour change, pale car above, a hot white line on
 * the layer being laid. Then the photo and the render stand on the plate. The plate clears when the
 * viewer turns away. Reduced motion and Pause draw the final frame at once.
 */
import { fitCanvas } from './ring.js';

const RISE = 3200;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function plate(side, { calm, isPaused, tick, onFail }) {
  const box = side.querySelector('.plate-box');
  const [bed, glow, ink, hot] = ['.plate-bed', '.plate-glow', '.plate-ink', '.plate-hot'].map((s) => box.querySelector(s));
  const read = side.querySelector('.plate-read');
  let lastRead = 0;
  let doc = null, w = 0, h = 0, P = null, laid = 0, t = null, done = false, failed = false, gi, gh, gg, lastTick = 0, lastGlow = 0, lastLay = 0;
  const G = 6;   // the glow: the ink drawn at a sixth of the size and stretched back, which is its blur
  const load = fetch(new URL('../assets/plate.json', import.meta.url)).then((r) => r.json()).then((d) => {
    // unpack: absolute first point, then deltas, in units of d.u
    d.L = d.L.map((paths) => paths.map((p) => { const a = p.slice(); for (let i = 2; i < a.length; i++) a[i] += a[i - 2]; return a; }));
    doc = d; layout();
  }).catch(() => { failed = true; onFail?.(); });   // no G-code: the page shows the still instead

  function layout() {
    w = box.clientWidth; h = box.clientHeight;
    if (!doc || !w || !h) return;
    const [sx, sy, sz] = doc.size;
    const ca = Math.cos(28 * Math.PI / 180), sa = Math.sin(28 * Math.PI / 180);
    const m = 12, sc = Math.min((w * 0.94) / ((sx + sy + 2 * m) * ca), (h * 0.9) / (((sx + sy + 2 * m) * sa) * 0.9 + sz * 0.9));
    const cy = h * 0.5 + (sz * sc * 0.9) * 0.5;
    P = (x, y, z) => [w / 2 + ((x - sx / 2) + (y - sy / 2)) * ca * sc, cy + ((x - sx / 2) - (y - sy / 2)) * sa * sc * 0.9 - z * sc * 0.9];
    const g = fitCanvas(bed, w, h);
    const cs = [P(-m, -m, 0), P(sx + m, -m, 0), P(sx + m, sy + m, 0), P(-m, sy + m, 0)];
    g.clearRect(0, 0, w, h); g.beginPath(); cs.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath();
    g.fillStyle = '#101117'; g.fill(); g.strokeStyle = '#3E404C'; g.lineWidth = 1; g.stroke();
    g.strokeStyle = '#191A21'; g.beginPath();
    for (let i = 1; i < 6; i++) {
      const a = -m + (sx + 2 * m) * i / 6, b = -m + (sy + 2 * m) * i / 6;
      g.moveTo(...P(a, -m, 0)); g.lineTo(...P(a, sy + m, 0));
      g.moveTo(...P(-m, b, 0)); g.lineTo(...P(sx + m, b, 0));
    }
    g.stroke();
    gi = fitCanvas(ink, w, h); gh = fitCanvas(hot, w, h);
    glow.width = Math.ceil(w / G); glow.height = Math.ceil(h / G); gg = glow.getContext('2d');
    gi.lineJoin = 'round';
    const n = laid; laid = 0; gi.clearRect(0, 0, w, h); lay(n); copyGlow();
  }
  function layer(i, g, col, lw) {
    const u = doc.u, z = doc.z[i]; g.strokeStyle = col; g.lineWidth = lw; g.beginPath();
    for (const p of doc.L[i]) for (let j = 0; j < p.length; j += 2) { const [x, y] = P(p[j] * u, p[j + 1] * u, z); j ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
  }
  function lay(to) {
    // painter's order, bottom up, so the print reads solid; each layer a touch lighter than the one
    // below, which is what shows the ribs and the plate's edge in a figure this small
    const top = doc.z[doc.z.length - 1], cut = doc.cut;
    while (laid < to) {
      const z = doc.z[laid], base = z <= cut + 1e-6, k = base ? z / cut : (z - cut) / (top - cut);
      layer(laid++, gi, base ? `rgb(${118 + 110 * k | 0},${48 + 62 * k | 0},${32 + 40 * k | 0})` : `rgb(${96 + 140 * k | 0},${96 + 136 * k | 0},${100 + 124 * k | 0})`, 0.9);
    }
    // the readout: the layer just laid and its height, straight from the file's Z values. Rewritten
    // about six times a second (each write is a layout), and always on the last layer
    const n = doc.z.length, at = performance.now();
    if (laid && laid < n && at - lastRead < 160) return;
    lastRead = at;
    const txt = !laid ? '' : laid < n ? `Layer ${laid} of ${n}, Z ${doc.z[laid - 1].toFixed(2)} mm`
      : `${n} layers, ${top.toFixed(2)} mm tall, colour change at ${cut.toFixed(2)} mm.`;
    if (read && read.textContent !== txt) read.textContent = txt;
  }
  const copyGlow = () => { gg.clearRect(0, 0, glow.width, glow.height); gg.drawImage(ink, 0, 0, glow.width, glow.height); };
  function clear() {
    t = null; done = false; laid = 0; if (read) read.textContent = '';
    if (gi) { gi.clearRect(0, 0, w, h); gh.clearRect(0, 0, w, h); gg.clearRect(0, 0, glow.width, glow.height); }
    side.classList.remove('built');
  }
  function finish() {
    if (failed) return;
    if (!doc || !P) { load.then(() => { if (doc) { layout(); finish(); } }); return; }
    lay(doc.z.length); gh.clearRect(0, 0, w, h); copyGlow(); done = true; side.classList.add('built');
  }
  function frame(now, near, lined) {
    if (!doc || !P) return;
    if (!near) { if (laid || done) clear(); return; }
    if (done) return;
    if (calm || isPaused()) { finish(); return; }
    if (lined && t == null) t = now;
    if (t == null) return;
    // the rise steps at 30 Hz: it is a three-second build, and each step strokes whole layers
    if (now - lastLay < 32) return;
    lastLay = now;
    const k = clamp((now - t) / RISE, 0, 1), to = Math.round(k * doc.z.length);
    const before = laid; lay(to);
    if (laid !== before) {
      if (now - lastGlow > 160 || k >= 1) { lastGlow = now; copyGlow(); }
      gh.clearRect(0, 0, w, h);
      if (k < 1) layer(laid - 1, gh, 'rgba(255,250,240,0.95)', 1.6);
      if (now - lastTick > 90) { lastTick = now; tick(k); }
    }
    if (k >= 1) { gh.clearRect(0, 0, w, h); done = true; side.classList.add('built'); }
  }
  new ResizeObserver(() => { if (doc) layout(); }).observe(box);
  if (calm) finish();
  return { frame, finish };
}
