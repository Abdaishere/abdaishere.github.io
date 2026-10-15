/* The /prints/ header: the word "AbdA" printed the way his Creality K1 Max prints, seen from the
 * front and a little above.
 *
 * The letters stand upright and are printed upright, so every layer is one row of the word: the
 * runs of ink in that row are rectangles on the bed (islands), each as deep as a fifth of the
 * letter height. For each layer the head does what a slicer tells it to: per island an inner wall
 * loop, the outer wall loop, then a zigzag of infill, with fast travel moves in between, left to
 * right on even layers and back on odd ones. Before layer 1 it lays the purge line Klipper's KAMP
 * puts 10 mm in front of the part. The K1 is CoreXY: the head stays at one height and moves in X
 * and Y, so on screen it also rides up and down as it goes round the walls; the bed drops one layer
 * height per layer, which is the shift you see. Fresh plastic is a wet, lighter red for a short
 * length behind the nozzle and dries to the matte filament red.
 *
 * When the last layer is down the head parks behind the part, then goes back to where it starts,
 * the print fades off the bed and the empty bed rises to its start height the way Z homes: the
 * last frame is frame 0, so the loop has no seam. The camera eases down as the bed sinks and back
 * up as it rises, so the action fills the frame from the first layer on. Under 600 px wide the
 * current layer is drawn as an outer wall around a solid top, without the infill zigzag.
 *
 * Projection: x is screen x, a point y deep and z high sits at (x, bedY - z - y * KY). No shear,
 * so rows stay level. Finished layers live on an offscreen canvas drawn once; a frame draws the
 * bed, that canvas, the current layer's toolpath up to the nozzle, and the head.
 *
 * Plain Canvas 2D, no library. The page boots this only when the header is on screen and the
 * reader has not asked for reduced motion; otherwise the still image under the canvas is the
 * header. Off screen or in a hidden tab the loop stops. The H1 above is the real text; this is
 * decoration (aria-hidden). */

const BASE = [216, 64, 43], WET = [246, 122, 92], TOP = [231, 86, 62];   // filament red, fresh off the nozzle, a lit top face
const LAYERS = 34, KY = 0.3;
// seconds: heat-up hold, purge, one layer, the Z drop at the end (inside the park), park, hold, head home, print fades off the bed, bed rises to Z home
const T_IDLE = 0.6, T_PURGE = 1.0, T_LAYER = 0.5, T_ZOFF = 0.3, T_PARK = 1.1, T_HOLD = 2.0, T_HOME = 0.7, T_FADE = 0.6, T_RISE = 1.2;

function mask(word, font, w, h) {
  // the word as ink on an offscreen canvas, read back as LAYERS rows of runs [x0, x1]
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

const ease = (u) => u * u * (3 - 2 * u);
const clamp = (v) => Math.max(0, Math.min(1, v));
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

export function start(canvas, { still = false } = {}) {
  const ctx = canvas.getContext('2d');
  const done = document.createElement('canvas'), dctx = done.getContext('2d');   // finished layers, bed at its final height
  const bedC = document.createElement('canvas'), bctx = bedC.getContext('2d');   // the plate, drawn once
  const bgC = document.createElement('canvas'), gctx = bgC.getContext('2d');      // the chamber and the Z screws, drawn once
  let W = 0, H = 0, dpr = 1, S = null, P = null;

  function layout() {
    W = canvas.clientWidth; H = canvas.clientHeight;
    if (!W || !H) return false;
    dpr = Math.min(devicePixelRatio || 1, 2);
    for (const c of [canvas, done]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    const font = getComputedStyle(document.documentElement).getPropertyValue('--display').trim() || 'sans-serif';
    const M = mask('AbdA', font, 1200, 420);
    const u = Math.max(12, Math.min(34, W * 0.026));          // the head's unit
    const wordW = M.x1 - M.x0, wordHm = M.lh * LAYERS, k0 = W * 0.7 / wordW;
    // the nozzle's height on screen, fixed (CoreXY); in a tall frame (the share card) the finished word sits mid-height
    const tip = Math.max(u * 3.9, H * 0.27, H * 0.5 - wordHm * k0 * 0.45);
    const k = Math.min(k0, (H * 0.8 - tip) / (wordHm * 1.06));
    const lh = M.lh * k, wordH = lh * LAYERS, D = wordH * 0.18;
    const left = W / 2 - wordW * k / 2 - M.x0 * k;
    const wall = D / 8;
    S = { u, tip, lh, D, wall, k, left, wordL: W / 2 - wordW * k / 2, wordR: W / 2 + wordW * k / 2,
          front: D * 2.6, back: D * 3.6, purgeY: -D * 0.75, bedEnd: tip + wordH, by0: tip + lh, cam: H * 0.22, small: W < 600 };
    S.runs = M.rows.map((r) => r.map(([a, b]) => [left + a * k, left + b * k]));
    P = S.runs.map((runs, l) => path(runs, l));
    S.purge = { x0: S.wordL, x1: S.wordL + Math.min(S.wordR - S.wordL, wordH * 1.4) };
    bed(); chamber();
    dctx.setTransform(1, 0, 0, 1, 0, 0); dctx.clearRect(0, 0, done.width, done.height);
    settled = -2;
    return true;
  }

  // ---- toolpath: one layer as segments [x0, y0, x1, y1, kind], kind 0 travel, 1 inner wall, 2 outer wall front edge, 3 infill, 4 outer wall
  function path(runs, l) {
    const segs = [], w = S.wall, D = S.D;
    const order = l % 2 === 0 ? runs : [...runs].reverse();
    for (const [a, b] of order) {
      const loops = b - a > w * 5 ? [1.5, 0.5] : [0.5];      // inner wall first, then outer, as Orca orders them
      for (const i of loops) {
        const x0 = a + w * i, x1 = b - w * i, y0 = w * i, y1 = D - w * i;
        if (x1 <= x0) continue;
        const o = i === 0.5 ? 4 : 1;
        segs.push([x0, y0, x1, y0, i === 0.5 ? 2 : 1], [x1, y0, x1, y1, o], [x1, y1, x0, y1, o], [x0, y1, x0, y0, o]);
      }
      const ix0 = a + w * 2, ix1 = b - w * 2, iy0 = w * 2, iy1 = D - w * 2, h = iy1 - iy0;
      if (ix1 - ix0 > w && h > 0) {        // 45 degree zigzag: up, over, down, over
        let x = ix0, up = true;
        while (x < ix1) { const nx = Math.min(ix1, x + h); segs.push([x, up ? iy0 : iy1, nx, up ? iy1 : iy0, 3]); x = nx; up = !up; }
      }
    }
    // travel moves between islands (and from the previous segment's end), counted at a fifth of their length: travel is fast
    const out = []; let s = 0, px = null, py = null;
    for (const g of segs) {
      if (px !== null && (px !== g[0] || py !== g[1])) { const t = Math.hypot(g[0] - px, g[1] - py) * 0.2; out.push([px, py, g[0], g[1], 0, s, s + t]); s += t; }
      const len = Math.hypot(g[2] - g[0], g[3] - g[1]); out.push([...g, s, s + len]); s += len; px = g[2]; py = g[3];
    }
    out.len = s;
    return out;
  }

  // ---- the bed: textured PEI on a black plate, a faint speckle drawn once so it never shimmers
  function bed() {
    const top = (S.front + S.back) * KY, edge = Math.max(4, S.u * 0.35);
    bedC.width = Math.round(W * dpr); bedC.height = Math.round((top + edge + S.u * 2) * dpr);
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = bctx.createLinearGradient(0, 0, 0, top);
    g.addColorStop(0, '#1d1f25'); g.addColorStop(1, '#2a2c33');
    bctx.fillStyle = g; bctx.fillRect(0, 0, W, top);
    let seed = 7; const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
    const n = Math.round(W * top / 9);
    for (let i = 0; i < n; i++) { bctx.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.22)'; bctx.fillRect(rnd() * W, rnd() * top, 1, 1); }
    bctx.fillStyle = 'rgba(255,255,255,0.08)'; bctx.fillRect(0, top - 1, W, 1);    // the plate's front edge catches the light
    bctx.fillStyle = '#111217'; bctx.fillRect(0, top, W, edge);
    const under = bctx.createLinearGradient(0, top + edge, 0, top + edge + S.u * 2);    // the bed carrier below the plate, into the dark
    under.addColorStop(0, '#16171c'); under.addColorStop(1, 'rgba(22,23,28,0)');
    bctx.fillStyle = under; bctx.fillRect(0, top + edge, W, S.u * 2);
  }

  // the chamber: dark, a little lighter low down, and the two rear Z lead screws the bed rides down on
  function chamber() {
    const h = H + S.cam + 4;   // taller than the frame: the camera moves over it
    bgC.width = Math.round(W * dpr); bgC.height = Math.round(h * dpr);
    gctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = gctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#0a0b0f'); bg.addColorStop(1, '#101117');
    gctx.fillStyle = bg; gctx.fillRect(0, 0, W, h);
    const r = Math.max(2, S.u * 0.16);
    for (const x of [W * 0.07, W * 0.93]) {
      gctx.fillStyle = '#1a1c22'; gctx.fillRect(x - r, 0, r * 2, h);
      gctx.fillStyle = 'rgba(255,255,255,0.05)';
      for (let y = 0; y < h; y += r * 1.2) gctx.fillRect(x - r, y, r * 2, Math.max(1, r * 0.3));   // the thread
    }
  }

  // where the bed's y = 0 line is on screen at time t, and the layer being printed
  function bedY(t) {
    const tp = t - T_IDLE - T_PURGE;
    if (tp < 0) return S.tip + S.lh;
    const l = Math.floor(tp / T_LAYER);
    if (l < LAYERS) return S.tip + S.lh * (l + (l === 0 ? 1 : ease(clamp((tp - l * T_LAYER) / (T_LAYER * 0.12)))));
    // end code: the bed steps down clear of the part before the head moves, and comes back up with the rest of the rise
    const low = S.bedEnd + S.lh * 6 * ease(clamp((t - T_PRINT) / T_ZOFF));
    return low + (S.by0 - low) * ease(clamp((t - T_FADED) / T_RISE));
  }

  // ---- beads
  function front(g, x0, x1, y, h, col) {
    // a bead's front face: rounded, a light crown, a dark seam under it, so layer lines read
    if (x1 - x0 < 0.5) return;
    g.fillStyle = rgb(col); g.beginPath(); g.roundRect(x0, y, x1 - x0, h, Math.min(h / 2, (x1 - x0) / 2)); g.fill();
    const sh = g.createLinearGradient(0, y, 0, y + h);
    sh.addColorStop(0, 'rgba(255,255,255,0.2)'); sh.addColorStop(0.45, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.32)');
    g.fillStyle = sh; g.fill();
  }
  function layerInto(g, l, by) {
    // a finished layer: front faces and lit top faces of its islands; the next layer up covers what it should
    const yTop = by - (l + 1) * S.lh, band = S.D * KY;
    for (const [a, b] of S.runs[l]) {
      g.fillStyle = rgb(TOP); g.fillRect(a, yTop - band, b - a, band);
      front(g, a, b, yTop, S.lh, BASE);
    }
  }
  function purgeInto(g, by, x1, heatTo) {
    const w = S.wall * 1.7, yTop = by - S.lh + (-S.purgeY) * KY;
    front(g, S.purge.x0, x1, yTop, S.lh, BASE);
    g.fillStyle = rgb(TOP); g.fillRect(S.purge.x0, yTop - w * KY, x1 - S.purge.x0, w * KY);
    if (heatTo) { const a = Math.max(S.purge.x0, x1 - heatTo); g.fillStyle = `rgba(${WET},0.75)`; g.fillRect(a, yTop - w * KY, x1 - a, w * KY + S.lh * 0.6); }
  }

  // the current layer, up to path length s; returns the nozzle's bed position
  function partial(l, s, by) {
    const segs = P[l], yTop = by - (l + 1) * S.lh, cool = S.D * 3.2;
    let nx = segs.length ? segs[0][0] : 0, ny = segs.length ? segs[0][1] : 0;
    // front faces grow as the outer wall's front edge goes down
    for (const g of segs) if (g[4] === 2 && g[5] < s) { const f = clamp((s - g[5]) / (g[6] - g[5])); front(ctx, g[0], g[0] + (g[2] - g[0]) * f, yTop, S.lh, BASE); }
    ctx.save();
    ctx.setTransform(dpr, 0, 0, -KY * dpr, 0, (yTop + camY) * dpr);    // draw in the bed plane: (x, depth)
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const pass of [0, 1]) {
      for (const g of segs) {
        if (g[5] >= s) break;
        const f = clamp((s - g[5]) / (g[6] - g[5])), x = g[0] + (g[2] - g[0]) * f, y = g[1] + (g[3] - g[1]) * f;
        nx = x; ny = y;
        if (g[4] === 0 || (S.small && g[4] === 1) || (S.small && pass === 1 && g[4] === 3)) continue;
        const age = s - g[6];
        // on a phone the infill stroke is as wide as the infill area: a solid top, not a zigzag
        if (pass === 0) { ctx.strokeStyle = rgb(age > cool ? BASE : mix(WET, BASE, clamp(age / cool))); ctx.lineWidth = S.small && g[4] === 3 ? S.D - S.wall * 3 : S.wall * 1.05; }
        else { ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = S.wall * 0.3; }
        ctx.beginPath(); ctx.moveTo(g[0], g[1]); ctx.lineTo(x, y); ctx.stroke();
      }
    }
    ctx.restore();
    return [nx, ny];
  }

  // ---- the head: K1-style shroud with the round front fan, the part-cooling duct, a sliver of the
  // heater block under it, the brass nozzle; the X gantry behind it at the carriage's depth
  function head(x, y, flow) {
    const u = S.u, tipY = S.tip - y * KY;
    const g = ctx;
    g.fillStyle = '#17181d'; g.fillRect(0, tipY - u * 3.55, W, u * 0.42);                 // the X rail
    g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(0, tipY - u * 3.55, W, Math.max(1, u * 0.06));
    if (flow) { const gl = g.createRadialGradient(x, tipY, 0, x, tipY, u * 1.1); gl.addColorStop(0, 'rgba(255,170,120,0.28)'); gl.addColorStop(1, 'rgba(255,170,120,0)'); g.fillStyle = gl; g.fillRect(x - u * 1.1, tipY - u * 1.1, u * 2.2, u * 2.2); }
    g.fillStyle = '#b07a3a'; g.beginPath(); g.moveTo(x - u * 0.22, tipY - u * 0.5); g.lineTo(x + u * 0.22, tipY - u * 0.5); g.lineTo(x + u * 0.07, tipY); g.lineTo(x - u * 0.07, tipY); g.closePath(); g.fill();
    g.fillStyle = '#8d939c'; g.fillRect(x - u * 0.42, tipY - u * 0.78, u * 0.84, u * 0.3);   // heater block
    g.fillStyle = '#25272e'; g.beginPath(); g.moveTo(x - u * 1.05, tipY - u * 1.05); g.lineTo(x - u * 1.35, tipY - u * 0.62); g.lineTo(x - u * 0.62, tipY - u * 0.62); g.lineTo(x - u * 0.5, tipY - u * 1.05); g.closePath(); g.fill();   // duct
    g.fillStyle = '#2c2f37'; g.beginPath(); g.roundRect(x - u * 1.15, tipY - u * 3.35, u * 2.3, u * 2.4, u * 0.28); g.fill();   // shroud
    g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(x - u * 1.15 + u * 0.28, tipY - u * 3.35, u * 1.74, Math.max(1, u * 0.07));
    g.strokeStyle = '#4b505b'; g.lineWidth = u * 0.16; g.beginPath(); g.arc(x, tipY - u * 2.15, u * 0.72, 0, Math.PI * 2); g.stroke();   // fan ring
    if (!S.small) { g.fillStyle = '#3a3e47'; g.beginPath(); g.arc(x, tipY - u * 2.15, u * 0.2, 0, Math.PI * 2); g.fill(); }   // hub
  }

  // ---- timeline
  const T_PRINT = T_IDLE + T_PURGE + LAYERS * T_LAYER, T_PARKED = T_PRINT + T_PARK, T_HELD = T_PARKED + T_HOLD, T_HOMED = T_HELD + T_HOME,
    T_FADED = T_HOMED + T_FADE, T_LOOP = T_FADED + T_RISE;
  let settled = -2, camY = 0;   // -1: purge settled, l: layers 0..l settled into `done`
  const start0 = () => [S.purge.x0, S.purgeY];
  const parkAt = () => [S.wordR + S.u * 2.2, S.D * 1.3];   // just behind the part, the rail stays in frame

  function settle(upTo) {
    if (upTo < settled) { dctx.setTransform(1, 0, 0, 1, 0, 0); dctx.clearRect(0, 0, done.width, done.height); settled = -2; }
    dctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (settled < -1 && upTo >= -1) { purgeInto(dctx, S.bedEnd, S.purge.x1, 0); settled = -1; }
    for (let l = settled + 1; l <= upTo; l++) { layerInto(dctx, l, S.bedEnd); settled = l; }
  }

  function scene(t) {
    const by = bedY(t);
    camY = S.cam * (1 - ease(clamp((by - S.by0) / (S.bedEnd - S.by0))));   // the camera follows the bed part of the way
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.drawImage(bgC, 0, camY - S.cam - 2, W, bgC.height / dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, camY * dpr);
    ctx.drawImage(bedC, 0, by - S.back * KY, W, bedC.height / dpr);
    const tp = t - T_IDLE - T_PURGE, l = Math.floor(tp / T_LAYER);
    settle(tp < 0 ? (t >= T_IDLE + T_PURGE ? -1 : -2) : Math.min(LAYERS - 1, l - 1));
    const gone = clamp((t - T_HOMED) / T_FADE);
    if (settled >= -1 && gone < 1) { ctx.globalAlpha = 1 - ease(gone); ctx.drawImage(done, 0, by - S.bedEnd, W, H); ctx.globalAlpha = 1; }
    if (t < T_IDLE) { head(...start0(), false); return; }
    if (tp < 0) {   // the purge line, left to right in front of the part
      const f = ease(clamp((t - T_IDLE) / T_PURGE)), x = S.purge.x0 + (S.purge.x1 - S.purge.x0) * f;
      purgeInto(ctx, by, x, S.D * 2.5); head(x, S.purgeY, f < 1); return;
    }
    if (l < LAYERS) {
      const u = (tp - l * T_LAYER) / T_LAYER, segs = P[l];
      const from = l === 0 ? [S.purge.x1, S.purgeY] : (() => { const e = P[l - 1].at(-1); return e ? [e[2], e[3]] : start0(); })();
      if (u < 0.12 || !segs.length) {     // Z drop and travel to the first island
        const to = segs.length ? [segs[0][0], segs[0][1]] : from, f = ease(clamp(u / 0.12));
        head(from[0] + (to[0] - from[0]) * f, from[1] + (to[1] - from[1]) * f, false); return;
      }
      const s = segs.len * clamp((u - 0.12) / 0.86);
      const [nx, ny] = partial(l, s, by);
      head(nx, ny, s < segs.len); return;
    }
    // park behind the part, hold, then home to the start while the print leaves and the bed rises
    const e = P[LAYERS - 1].at(-1), last = e ? [e[2], e[3]] : start0(), pk = parkAt(), s0 = start0();
    const go = (a, b, f) => head(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, false);
    if (t < T_HELD) go(last, pk, ease(clamp((t - T_PRINT - T_ZOFF) / (T_PARK - T_ZOFF))));
    else go(pk, s0, ease(clamp((t - T_HELD) / T_HOME)));
  }

  const render = (t) => scene(t);

  let t0 = performance.now(), running = false, raf = 0, disposed = false;
  function frame(now) {
    if (!running || disposed) return;
    raf = requestAnimationFrame(frame);
    let time = (now - t0) / 1000;
    if (time >= T_LOOP) { t0 = now - (time - T_LOOP) * 1000; time -= T_LOOP; }   // wrap without dropping the leftover
    render(time);
  }
  const poseT = () => (still ? T_PARKED + 1 : 0);
  const ro = new ResizeObserver(() => { if (layout()) render(poseT()); });
  ro.observe(canvas);
  if (layout()) render(poseT());

  const api = {
    play() { if (running || disposed || still) return; running = true; t0 = performance.now(); raf = requestAnimationFrame(frame); },
    pause() { running = false; cancelAnimationFrame(raf); },
    dispose() { api.pause(); disposed = true; ro.disconnect(); },
    layers: LAYERS, seconds: T_PRINT, loop: T_LOOP, still: T_PARKED + 1, renderAt(t) { render(t); },   // gate hooks
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
