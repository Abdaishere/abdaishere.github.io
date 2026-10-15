/* The /prints/ header: a toolhead sweeps back and forth over a dark bed and builds the word
 * "AbdA" one layer at a time, seen from the front, the way an FDM printer lays a part down.
 *
 * The word is set in the site's display face on an offscreen canvas and read back as a mask.
 * Each layer is one row of that mask: the runs of ink in the row are the lines the nozzle lays
 * on that pass. The head crosses the whole bed at a constant speed, left to right on even
 * layers and back on odd ones, extruding only where the letters are and travelling over the
 * gaps, so every line appears under the nozzle as it passes. Fresh plastic glows and cools.
 * When the last layer is down the head parks, the word holds, the canvas fades and it loops.
 *
 * Plain Canvas 2D, no library. The page boots this only when the header is on screen and the
 * reader has not asked for reduced motion; otherwise the still image under the canvas is the
 * header. Off screen or in a hidden tab the loop stops. The visible H1 is real text above this;
 * the canvas is decoration. Finished rows live on an offscreen canvas and are copied once per
 * frame, so a frame costs the current row plus the head. */

const BED = '#0c0d12', PLATE = '#1b1c22', PLATE_EDGE = '#2b2d36', GRID = 'rgba(255,255,255,0.045)';
const BASE = [216, 64, 43], HOT = [255, 178, 122];     // filament red, and fresh off the nozzle
const LAYERS = 34, HOLD = 3.0, SWEEP = 0.46, LIFT = 0.08, PARK = 0.9, OFF = 1.1, REST = 0.5;   // layers, seconds

function mask(word, font, w, h) {
  // the word as ink on an offscreen canvas, read back row by row as runs of [x0, x1]
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#fff'; g.textBaseline = 'alphabetic'; g.textAlign = 'center';
  let size = h * 0.92;
  g.font = `800 ${size}px ${font}`;
  size *= Math.min(1, (w * 0.96) / g.measureText(word).width);
  g.font = `800 ${size}px ${font}`;
  const mm = g.measureText(word);
  g.fillText(word, w / 2, (h + mm.actualBoundingBoxAscent - mm.actualBoundingBoxDescent) / 2);
  const d = g.getImageData(0, 0, w, h).data;
  let top = h, bottom = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 128) { top = Math.min(top, y); bottom = Math.max(bottom, y); break; }
  const rows = [];
  const lh = (bottom - top + 1) / LAYERS;
  for (let i = 0; i < LAYERS; i++) {
    const y = Math.max(top, Math.min(bottom, Math.round(bottom - (i + 0.5) * lh)));   // layer 0 is the bottom row
    const runs = []; let s = -1;
    for (let x = 0; x <= w; x++) {
      const on = x < w && d[(y * w + x) * 4 + 3] > 128;
      if (on && s < 0) s = x;
      if (!on && s >= 0) { if (x - s > 2) runs.push([s, x]); s = -1; }
    }
    rows.push(runs);
  }
  let x0 = w, x1 = 0;
  for (const r of rows) for (const [a, b] of r) { x0 = Math.min(x0, a); x1 = Math.max(x1, b); }
  return { rows, lh, x0, x1 };
}

export function start(canvas, { still = false } = {}) {
  const ctx = canvas.getContext('2d');
  const done = document.createElement('canvas');
  const dctx = done.getContext('2d');
  let W = 0, H = 0, M = null, S = null;   // S: the word's place on screen

  function layout() {
    W = canvas.clientWidth; H = canvas.clientHeight;
    if (!W || !H) return false;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = done.width = Math.round(W * dpr); canvas.height = done.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); dctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const font = getComputedStyle(document.documentElement).getPropertyValue('--display').trim() || 'sans-serif';
    M = mask('AbdA', font, 1200, 420);
    const wordW = M.x1 - M.x0, scale = Math.min(W * 0.72 / wordW, H * 0.6 / (M.lh * LAYERS));
    const plateY = H * 0.84, wordLeft = W / 2 - wordW * scale / 2;
    S = { scale, left: wordLeft - M.x0 * scale, plateY, lh: M.lh * scale, wordLeft, wordRight: wordLeft + wordW * scale };
    return true;
  }

  function plate(g) {
    g.fillStyle = BED; g.fillRect(0, 0, W, H);
    g.fillStyle = '#15161c'; g.fillRect(0, H * 0.085, W, H * 0.022);
    // the bed as a plate seen edge-on with its top face just visible
    g.fillStyle = PLATE; g.fillRect(0, S.plateY, W, H - S.plateY);
    g.fillStyle = PLATE_EDGE; g.fillRect(0, S.plateY, W, Math.max(1.5, H * 0.006));
    g.strokeStyle = GRID; g.lineWidth = 1;
    const step = Math.max(28, W / 24);
    for (let x = (W / 2) % step; x < W; x += step) { g.beginPath(); g.moveTo(x, S.plateY + 4); g.lineTo(x, H); g.stroke(); }
    const tex = g.createLinearGradient(0, S.plateY, 0, H);
    tex.addColorStop(0, 'rgba(255,255,255,0.05)'); tex.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = tex; g.fillRect(0, S.plateY, W, H - S.plateY);
  }

  const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
  function line(g, layer, xa, xb, heat) {
    // one bead of plastic: a rounded line with a lighter crown, so the layer lines read as a print
    if (xb - xa < 0.5) return;
    const y = S.plateY - (layer + 1) * S.lh, h = S.lh * 0.98, r = h / 2;
    const col = heat > 0 ? HOT.map((v, i) => Math.round(v * heat + BASE[i] * (1 - heat))) : BASE;
    g.fillStyle = rgb(col);
    g.beginPath(); g.roundRect(xa, y, xb - xa, h, r); g.fill();
    const sh = g.createLinearGradient(0, y, 0, y + h);
    sh.addColorStop(0, 'rgba(255,255,255,0.22)'); sh.addColorStop(0.55, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.28)');
    g.fillStyle = sh; g.beginPath(); g.roundRect(xa, y, xb - xa, h, r); g.fill();
  }
  function head(g, x, layer, extruding) {
    const tipY = S.plateY - (layer + 1) * S.lh - 1;
    const u = Math.max(14, S.lh * 3.2);            // the head scales with the layer height
    g.save();
    g.translate(x, tipY);
    if (extruding) {   // the glow of the fresh bead under the nozzle
      const gl = g.createRadialGradient(0, 2, 0, 0, 2, u * 1.6);
      gl.addColorStop(0, 'rgba(255,150,80,0.55)'); gl.addColorStop(1, 'rgba(255,150,80,0)');
      g.fillStyle = gl; g.fillRect(-u * 1.6, -u * 1.6, u * 3.2, u * 3.2);
    }
    // the carriage down from the gantry, the heat sink with its fins, the heater block, the brass tip
    g.fillStyle = '#1d1f26'; g.fillRect(-u * 0.5, -(tipY - H * 0.107), u, (tipY - H * 0.107) - u * 3.3);
    g.fillStyle = '#3a3d47'; g.fillRect(-u * 0.95, -u * 3.3, u * 1.9, u * 1.25);
    g.fillStyle = '#23252d'; for (let i = 0; i < 4; i++) g.fillRect(-u * 0.95, -u * 3.3 + i * u * 0.3, u * 1.9, u * 0.07);
    g.fillStyle = '#2a2c34'; g.fillRect(-u * 0.75, -u * 2.0, u * 1.5, u * 1.05);
    g.fillStyle = '#c99a52'; g.beginPath(); g.moveTo(-u * 0.42, -u * 0.95); g.lineTo(u * 0.42, -u * 0.95); g.lineTo(u * 0.12, -u * 0.08); g.lineTo(-u * 0.12, -u * 0.08); g.closePath(); g.fill();
    g.restore();
  }

  // ---- timeline: one sweep per layer, a short lift between, then park and hold
  const layerT = SWEEP + LIFT;
  const T_DONE = 0.5 + LAYERS * layerT, T_PARK = T_DONE + PARK, T_OFF = T_PARK + HOLD, T_LOOP = T_OFF + OFF + REST;
  const ease = (u) => u * u * (3 - 2 * u);   // a toolhead accelerates and brakes at each end of a pass
  let drawnLayer = -1;    // the highest layer settled into the offscreen canvas
  const sweep = (layer) => layer % 2 === 0;   // even layers go left to right
  const xAt = (layer, f) => { const a = S.wordLeft - S.lh * 6, b = S.wordRight + S.lh * 6, e = ease(Math.min(1, Math.max(0, f))); return sweep(layer) ? a + (b - a) * e : b - (b - a) * e; };
  const xPark = () => S.lh * 4;

  function render(time) {
    const k = Math.floor((time - 0.5) / layerT), f = ((time - 0.5) - k * layerT) / SWEEP;
    const layer = Math.min(LAYERS - 1, Math.max(0, k));
    if (time < 0.5 && drawnLayer !== -1) { dctx.clearRect(0, 0, W, H); drawnLayer = -1; }
    // settle every layer below the current one into the offscreen canvas, once
    const settleTo = time >= T_DONE ? LAYERS - 1 : layer - 1;
    for (let l = drawnLayer + 1; l <= settleTo; l++) { for (const [a, b] of M.rows[l]) line(dctx, l, S.left + a * S.scale, S.left + b * S.scale, 0); drawnLayer = l; }
    plate(ctx);
    if (time >= T_OFF) {
      // the finished word is lifted off the bed while the head goes back to where the next print starts
      const u = Math.min(1, (time - T_OFF) / OFF), e = u * u * u;
      ctx.drawImage(done, 0, -e * (S.plateY + S.lh), W, H);
      const v = ease(Math.min(1, (time - T_OFF) / (OFF + REST * 0.6)));
      head(ctx, xPark() + (xAt(0, 0) - xPark()) * v, (LAYERS - 1 + 6) * (1 - v), false);
      return;
    }
    ctx.drawImage(done, 0, 0, W, H);
    if (time >= T_DONE) {
      const e = ease(Math.min(1, (time - T_DONE) / PARK));
      const xEnd = xAt(LAYERS - 1, 1);
      head(ctx, xEnd + (xPark() - xEnd) * e, LAYERS - 1 + e * 6, false);
      return;
    }
    if (time < 0.5) { head(ctx, xAt(0, 0), 0, false); return; }
    const nx = xAt(layer, f);
    const span = W * 0.22;      // the just-laid plastic cools over about a fifth of the bed behind the nozzle
    const heat = (x) => Math.max(0, 1 - Math.abs(nx - x) / span);
    for (const [a, b] of M.rows[layer]) {
      const xa = S.left + a * S.scale, xb = S.left + b * S.scale;
      const lo = sweep(layer) ? xa : Math.max(xa, nx), hi = sweep(layer) ? Math.min(xb, nx) : xb;
      if (hi <= lo) continue;
      line(ctx, layer, lo, hi, 0);
      // the hot tail, as a run of short segments shading from HOT at the nozzle to BASE
      const tlo = Math.max(lo, nx - span), thi = Math.min(hi, nx + span);
      if (thi > tlo) { const n = Math.max(1, Math.ceil((thi - tlo) / 10)); for (let i = 0; i < n; i++) { const p = tlo + (thi - tlo) * i / n, q = Math.min(thi, tlo + (thi - tlo) * (i + 1) / n + 0.6); line(ctx, layer, p, q, heat((p + q) / 2)); } }
    }
    const over = f <= 1 && M.rows[layer].some(([a, b]) => nx >= S.left + a * S.scale && nx <= S.left + b * S.scale);
    const lift = f > 1 ? Math.sin(Math.min(1, (f - 1) * SWEEP / LIFT) * Math.PI) * 0.6 : 0;
    head(ctx, nx, layer + lift, over);
  }

  let start = performance.now(), running = false, raf = 0, disposed = false;
  function frame(now) {
    if (!running || disposed) return;
    raf = requestAnimationFrame(frame);
    let time = (now - start) / 1000;
    if (time >= T_LOOP) { start = now - (time - T_LOOP) * 1000; time -= T_LOOP; }   // wrap without dropping the leftover
    render(time);
  }
  const ro = new ResizeObserver(() => { if (layout()) { drawnLayer = -1; dctx.clearRect(0, 0, W, H); render(still ? T_PARK + 1 : 0); } });
  ro.observe(canvas);
  if (layout()) render(still ? T_PARK + 1 : 0);

  const api = {
    play() { if (running || disposed || still) return; running = true; start = performance.now(); drawnLayer = -1; dctx.clearRect(0, 0, W, H); raf = requestAnimationFrame(frame); },
    pause() { running = false; cancelAnimationFrame(raf); },
    dispose() { api.pause(); disposed = true; ro.disconnect(); },
    layers: LAYERS, seconds: T_DONE, loop: T_LOOP, renderAt(t) { drawnLayer = -1; dctx.clearRect(0, 0, W, H); render(t); },   // gate hook
  };
  return api;
}

// ------------------------------------------------------------------ boot
const box = document.querySelector('.hdr');
if (box) {
  const canvas = box.querySelector('canvas');
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  const still = location.hash === '#still';   // the poster is rendered from this state
  let api = null, onScreen = false;
  const sync = () => { if (!api) return; if (onScreen && !document.hidden && !calm.matches) api.play(); else api.pause(); };
  const boot = async () => {
    if (api || (calm.matches && !still)) return;
    const face = getComputedStyle(document.documentElement).getPropertyValue('--display').trim() || 'sans-serif';
    try { await document.fonts.load('800 40px ' + face); } catch (e) { /* the fallback face is fine */ }
    if (api || (calm.matches && !still)) return;
    try {
      api = start(canvas, { still });
      box.classList.add('live');
      window.__header = api;   // gate hook
    } catch (err) { console.info('Header animation unavailable, keeping the still.', err); }
    sync();
  };
  new IntersectionObserver((es) => { onScreen = es[0].isIntersecting; if (onScreen) boot(); sync(); }, { threshold: 0.15 }).observe(box);
  document.addEventListener('visibilitychange', sync);
  calm.addEventListener('change', () => { if (calm.matches) { api?.dispose(); api = null; window.__header = null; box.classList.remove('live'); } else if (onScreen) boot(); });
  if (still) boot();
}
