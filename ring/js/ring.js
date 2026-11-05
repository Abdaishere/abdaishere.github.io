/* The Ring, abdaishere.com full-screen view (design/fullscreen-mode/STORY.md).
 *
 * Six faces of a PolyBall ring round a horizontal axis in CSS 3D, seen from inside; scroll turns it.
 * This module is the whole page's behaviour: the scroll-to-angle mapping with its dwell and settle,
 * the drum, the 120 BPM clock, the dots, Normal view, the keyboard, the side 2 network, the side 3
 * beat tap, the side 4 climax and the Dubai clock. Two parts load only when they are needed:
 * audio.js on the first press of Sound, plate.js when side 5 comes near.
 *
 * Scroll is native. The angle is a pure function of scrollY; nothing moves the page while a thumb or
 * wheel is moving it. The only programmatic scrolls are the settle after input stops, the dots, the
 * keyboard and focus, and the unseen wrap from the second "Hello" back to the first.
 * Per frame: one read of scrollY, then transform and opacity writes, each skipped when unchanged.
 *
 * Public state, for the stylesheet and for tests, is on <html>: data-side (the side nearest the
 * viewer), data-aligned (the side lined up square, empty mid-turn), data-climax (show or plain, on
 * side 4), data-visited and data-ready.
 */

// ring-palette.json, first six (a ring of N sides uses entries 0..N-1, the brand order never moves)
const PALETTE = ['#fb3f4a', '#ff891d', '#f8da23', '#9bff97', '#3fd0e0', '#4a8cff'];
const AMBER = '#F5A524';
const N = 6, STEP = 360 / N, DEG = Math.PI / 180;
const BEAT = 500, WINDOW = 60, FALL = BEAT / 2;
const IDLE = 340;   // the site's 120 BPM clock and PolyBall's on-beat window (tap.js)

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = (t) => 0.4 * t + 0.6 * (0.5 - 0.5 * Math.cos(Math.PI * t));   // keeps a hand on the scroll, softens the ends
const wrap = (d) => ((d % 360) + 540) % 360 - 180;
export const fitCanvas = (c, w, h) => {
  const dpr = Math.min(2, devicePixelRatio || 1);
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); return g;
};

const root = document.documentElement;
const calm = root.classList.contains('rm');
const phoneQ = matchMedia('(max-width: 47.99rem)');
// the layout was chosen before first paint (index.html); a rotation or zoom across that line reloads
// into the other one, which is all a reload costs here: the ring remembers nothing
const plainQ = matchMedia('(prefers-reduced-motion: reduce), (max-height: 29.99rem)');
plainQ.addEventListener('change', () => { if (plainQ.matches !== calm) location.reload(); });
const sides = $$('main .side'), ins = sides.map((s) => $('.side-in', s));
const drum = $('.drum'), track = $('.spacer'), probe = $('.vh-probe');
const dots = $$('.dot'), live = $('#ring-live');
const whereNo = $('.where-no'), whereName = $('.where-name');
const soundBtn = $('.sound'), pauseBtn = $('.pause'), normal = $('.normal');

const st = {
  angle: 0, f: 0, vw: innerWidth, vh: innerHeight, phone: phoneQ.matches, pulse: 0,
  aligned: 0, visited: new Set([0]), climax: null, paused: false,
};
const t0 = performance.now();

/* ---------------------------------------------------------------- sound: off until pressed.
   audio.js holds the synth (the game's chime voice, every tone synthesised); it is not even fetched
   until the first press. */
let sfx = null;
const soundOn = () => soundBtn.getAttribute('aria-pressed') === 'true';
const play = (fn) => { if (soundOn() && sfx) fn(sfx); };
soundBtn.addEventListener('click', async () => {
  const on = !soundOn();
  soundBtn.setAttribute('aria-pressed', String(on));
  if (!on) { sfx?.suspend(); return; }
  sfx ||= await import('./audio.js');
  sfx.sync(t0);   // one clock: the tones sit on the same 120 BPM grid as the beat dot
  if (soundOn()) { sfx.resume(); sfx.side(st.aligned >= 0 ? st.aligned : 0); }
});
document.addEventListener('visibilitychange', () => { if (sfx) document.hidden || !soundOn() ? sfx.suspend() : sfx.resume(); });

/* ---------------------------------------------------------------- pause (WCAG 2.2.2) */
pauseBtn.addEventListener('click', () => {
  st.paused = pauseBtn.getAttribute('aria-pressed') !== 'true';
  pauseBtn.setAttribute('aria-pressed', String(st.paused));
  root.classList.toggle('paused', st.paused);
  if (st.paused) { plate?.finish(); if (st.climax) st.climax.out = true; }
});

/* ---------------------------------------------------------------- lazy images: a side's pictures
   load when the side comes near, so the first screen fetches only the page and its fonts. */
const imagesIn = new Set();
let onImages = null;   // the drum re-measures a side's overflow once its pictures have arrived
const loadImages = (k) => {
  if (imagesIn.has(k)) return;
  imagesIn.add(k);
  const got = [];
  for (const img of $$('img[data-src]', sides[k])) {
    if (img.classList.contains('plate-still') && !root.classList.contains('save-data')) continue;
    img.src = img.dataset.src; img.removeAttribute('data-src');
    got.push(img.decode().catch(() => {}));
  }
  if (got.length && onImages) Promise.all(got).then(() => onImages(k));
};

/* ---------------------------------------------------------------- Dubai clock, as in the status bar */
const clocks = $$('.clock');
const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit' });
const tick = () => clocks.forEach((c) => { c.textContent = fmt.format(new Date()); });
tick(); setInterval(tick, 15000);

/* ---------------------------------------------------------------- the receipt on side 4: what this
   page has cost so far, measured by the page itself (Resource Timing and the frame loop's own clock),
   so the footer's "no framework" line comes with its numbers */
const receipt = $('.receipt');
let frameMs = 0;   // the frame loop's script time, a running average
// the bytes as served, and the share of them that is side 5's G-code, which is most of the total and
// says so, so the figure does not read as the cost of the page's own HTML, CSS and script
const loaded = () => {
  let all = 0, gcode = 0;
  for (const e of [...performance.getEntriesByType('navigation'), ...performance.getEntriesByType('resource')]) {
    all += e.encodedBodySize || 0; if (/plate\.json/.test(e.name)) gcode += e.encodedBodySize || 0;
  }
  return [Math.round(all / 1024), Math.round(gcode / 1024)];
};
const writeReceipt = () => {
  const [kb, g] = loaded();
  const bytes = `So far this page has loaded ${kb} KB` + (g ? ` (${g} KB of it the G-code on side 5)` : '');
  receipt.textContent = calm || !frameMs ? `${bytes}.` : `${bytes}, and each frame takes ${frameMs.toFixed(1)} ms of script.`;
};

/* ---------------------------------------------------------------- the beat ring in the corner:
   the status bar's pulse, a ring closing onto the dot each beat */
const bc = $('.beat-ring'), bdot = $('.beat-dot');
let bg = null, lastBeatOp = '', tickAt = -1e9, tickCol = '#8B919E';
function drawBeat(ph, now) {
  if (calm) return;
  bg ||= fitCanvas(bc, 24, 24);
  bg.clearRect(0, 0, 24, 24);
  const op = st.paused ? '1' : (ph < 100 ? 1 : Math.max(0.25, 1 - (ph - 100) / 150)).toFixed(2);
  if (op !== lastBeatOp) { lastBeatOp = op; bdot.style.opacity = op; }
  // the tick that marks a turn: the ring flashes once, in the colour of the side that lined up
  const tk = (now - tickAt) / 480;
  if (tk < 1) {
    bg.globalAlpha = 1 - tk; bg.lineWidth = 2; bg.strokeStyle = tickCol;
    bg.beginPath(); bg.arc(12, 12, 11, 0, 6.2832); bg.stroke();
  }
  if (st.paused) return;
  // the beat closes from inside the rim, which is the tick's alone, so the two never mix
  bg.globalAlpha = Math.min(1, ph / 150); bg.lineWidth = 1.5; bg.strokeStyle = '#8B919E';
  bg.beginPath(); bg.arc(12, 12, 3.5 + 5.5 * (1 - ph / BEAT), 0, 6.2832); bg.stroke();
}

/* ---------------------------------------------------------------- side 2: the network.
   A drawing, captioned as one: a few nodes, the Center Point in the middle, packets on the beat. */
const net = (() => {
  const c = $('.net-c'), box = c.parentElement;
  const NODES = [[0.5, 0.5, 1], [0.12, 0.2], [0.88, 0.18], [0.1, 0.8], [0.9, 0.82], [0.5, 0.06]];
  const EDGES = [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [1, 3], [2, 4], [1, 5], [2, 5]];
  let w = 0, h = 0, g = null, packets = [], idle = false;
  const size = () => { w = box.clientWidth; h = box.clientHeight; g = w && h ? fitCanvas(c, w, h) : null; idle = false; };
  const P = ([x, y]) => [x * w, y * h];
  function draw(now, still) {
    if (!g) size(); if (!g) return;
    if (idle && !packets.length) return;          // nothing in flight: the last frame stands
    g.clearRect(0, 0, w, h);
    g.lineWidth = 1; g.strokeStyle = '#3A3F4C';
    g.beginPath();
    for (const [a, b] of EDGES) { const [x1, y1] = P(NODES[a]), [x2, y2] = P(NODES[b]); g.moveTo(x1, y1); g.lineTo(x2, y2); }
    g.stroke();
    // the still frame: five packets mid-flight, as a reduced-motion or paused viewer sees them
    const list = still ? EDGES.slice(0, 5).map((e, i) => ({ e, t0: now - 160 - i * 55, dir: i % 2 })) : packets;
    g.lineCap = 'round'; g.lineWidth = 2.5;
    for (const p of list) {
      const t = (now - p.t0) / 420; if (t < 0 || t > 1) continue;
      const [a, b] = p.dir ? [p.e[1], p.e[0]] : p.e; const [x1, y1] = P(NODES[a]), [x2, y2] = P(NODES[b]);
      const u = ease(t), v = Math.max(0, u - 0.12);
      g.strokeStyle = `rgba(245,165,36,${(1 - t * 0.5).toFixed(2)})`;
      g.beginPath(); g.moveTo(x1 + (x2 - x1) * v, y1 + (y2 - y1) * v); g.lineTo(x1 + (x2 - x1) * u, y1 + (y2 - y1) * u); g.stroke();
    }
    packets = packets.filter((p) => now - p.t0 < 420);
    for (const n of NODES) {
      const [x, y] = P(n);
      g.beginPath(); g.arc(x, y, n[2] ? 7 : 4.5, 0, 6.2832);
      g.fillStyle = n[2] ? '#0A0B0F' : '#A8ADB8'; g.fill();
      if (n[2]) { g.lineWidth = 2; g.strokeStyle = AMBER; g.stroke(); g.lineWidth = 2.5; }
    }
    idle = still || !packets.length;
  }
  const beat = (now) => { for (let i = 0; i < 3; i++) packets.push({ e: EDGES[(Math.random() * EDGES.length) | 0], t0: now, dir: Math.random() < 0.5 }); idle = false; };
  new ResizeObserver(size).observe(box);
  return { draw, beat };
})();

/* ---------------------------------------------------------------- side 3: the beat tap.
   After a dwell, "tap the ring on the beat." appears; a tap on the hint, or on the ring outside the
   side's content, is judged against the clock with PolyBall's 60 ms window. */
const tap = (() => {
  const zone = $('.tapzone'), hint = $('.hint', zone), say = $('.hits', zone), status = $('[role="status"]', zone);
  const hc = $('canvas', hint), hfill = $('i', hint);
  let shown = false, hits = 0, streak = 0, sayTimer = 0, hg = null;
  const fx = document.body.appendChild(document.createElement('canvas'));
  fx.className = 'burst'; fx.setAttribute('aria-hidden', 'true');
  let bursts = [], fg = null;
  const show = (on) => { if (on === shown) return; shown = on; zone.classList.toggle('show', on); root.classList.toggle('tapping', on && !calm); };
  const judge = (ts) => { const ph = ((ts - t0) % BEAT + BEAT) % BEAT, ms = ph > BEAT / 2 ? ph - BEAT : ph; return { ms: Math.round(ms), hit: Math.abs(ms) <= WINDOW }; };
  function press(ts, x, y) {
    const j = judge(ts);
    bursts.push({ x, y, t: performance.now(), hit: j.hit });
    clearTimeout(sayTimer);
    if (j.hit) {
      hits++; streak++;
      say.textContent = `${hits} on the beat`; status.textContent = `On the beat. ${hits} so far.`;
      play((a) => a.hit(streak - 1));
    } else {
      streak = 0;
      const when = `${Math.abs(j.ms)} ms ${j.ms > 0 ? 'late' : 'early'}`;
      say.textContent = when; status.textContent = `${Math.abs(j.ms)} milliseconds ${j.ms > 0 ? 'late' : 'early'}.`;
      sayTimer = setTimeout(() => { say.textContent = `${hits} on the beat`; }, 1600);
    }
    if (calm) requestAnimationFrame(still);
  }
  const at = () => { const r = hint.getBoundingClientRect(); return [r.left + 22, r.top + r.height / 2]; };
  hint.addEventListener('pointerdown', (e) => { if (e.button > 0 || !shown) return; press(e.timeStamp, ...at()); });
  hint.addEventListener('keydown', (e) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault(); e.stopPropagation(); if (e.repeat || !shown) return;
    press(e.timeStamp, ...at());
  });
  hint.addEventListener('click', (e) => e.preventDefault());
  // The ring itself: a press on the face or the stage outside the side's content, once the hint is up.
  $('.stage').addEventListener('pointerdown', (e) => {
    if (calm || e.button > 0 || !shown) return;
    if (e.target.closest('a, button, .side-in > *, .dots, .chrome')) return;
    press(e.timeStamp, e.clientX, e.clientY);
  });
  function frame(now, ph) {
    if (shown) {
      hg ||= fitCanvas(hc, 24, 24);
      hg.clearRect(0, 0, 24, 24);
      if (!calm && !st.paused) {
        hg.globalAlpha = Math.min(1, ph / 150); hg.lineWidth = 1.5; hg.strokeStyle = AMBER;
        hg.beginPath(); hg.arc(12, 12, 3.5 + 7 * (1 - ph / BEAT), 0, 6.2832); hg.stroke();
        hfill.style.opacity = ph < 100 ? 1 : Math.max(0, 1 - (ph - 100) / 150);
      } else hfill.style.opacity = 0.6;
    }
    if (!bursts.length) { if (fg) { fg.clearRect(0, 0, st.vw, st.vh); fg = null; } return false; }
    fg ||= fitCanvas(fx, innerWidth, innerHeight);
    fg.clearRect(0, 0, innerWidth, innerHeight);
    bursts = bursts.filter((b) => now - b.t < 520);
    for (const b of bursts) {
      const t = (now - b.t) / 520, col = b.hit ? '245,165,36' : '225,29,72';
      fg.strokeStyle = `rgba(${col},${(1 - t).toFixed(2)})`; fg.lineWidth = b.hit ? 3 : 2;
      fg.beginPath(); fg.arc(b.x, b.y, 8 + (b.hit ? 90 : 34) * ease(t), 0, 6.2832); fg.stroke();
      if (b.hit) for (let i = 0; i < 10; i++) {
        const a = i * 0.628 + 0.3, r1 = 14 + 70 * ease(t), r2 = r1 + 14 * (1 - t);
        fg.beginPath(); fg.moveTo(b.x + Math.cos(a) * r1, b.y + Math.sin(a) * r1); fg.lineTo(b.x + Math.cos(a) * r2, b.y + Math.sin(a) * r2); fg.stroke();
      }
    }
    return true;
  }
  // reduced motion: the burst still plays out (it is the reward, and short), the ring does not pulse
  const still = () => { if (frame(performance.now(), 0)) requestAnimationFrame(still); };
  return { show, frame };
})();

/* ---------------------------------------------------------------- side 5: the build plate, loaded near */
let plate = null, plateLoading = null;
// the still of the finished plate, in place of the G-code: data saver, or a fetch that failed
const stillPlate = { frame(_n, near, lined) { if (near && lined) sides[4].classList.add('built'); else if (!near) sides[4].classList.remove('built'); }, finish() { sides[4].classList.add('built'); } };
const plateFallback = () => {
  root.classList.add('plate-fallback');
  const im = $('.plate-still', sides[4]);
  if (im.dataset.src) { im.src = im.dataset.src; im.removeAttribute('data-src'); }
  plate = stillPlate;
  if (calm || st.paused) plate.finish();
};
const plateNear = () => {
  if (plate || plateLoading) return;
  if (root.classList.contains('save-data')) { plate = stillPlate; return; }
  plateLoading = import('./plate.js')
    .then((m) => { plate = m.plate(sides[4], { calm, isPaused: () => st.paused, tick: (k) => play((a) => a.layer(k)), onFail: plateFallback }); })
    .catch(plateFallback);
};

/* ---------------------------------------------------------------- reduced motion: a plain page.
   The ring does not turn; the module only keeps the readout, the dots and Normal view on the section
   in view, finishes the network and the plate, and keeps the beat tap. */
if (calm) {
  sides.forEach((_, k) => loadImages(k));
  sides[1].classList.add('is-lit');
  net.draw(performance.now(), true);
  tap.show(true);
  plateNear();
  (plateLoading || Promise.resolve()).then(() => plate.finish());
  const io = new IntersectionObserver((es) => {
    for (const e of es) if (e.isIntersecting) {
      const k = +e.target.dataset.side;
      dots.forEach((d, i) => i === k ? d.setAttribute('aria-current', 'step') : d.removeAttribute('aria-current'));
      whereNo.textContent = String(k + 1).padStart(2, '0'); whereName.textContent = sides[k].dataset.name;
      normal.href = sides[k].dataset.normal; root.dataset.side = k;
      writeReceipt();
    }
  }, { rootMargin: '-45% 0px -45% 0px' });
  sides.forEach((s) => io.observe(s));
  dots.forEach((d, i) => d.addEventListener('click', () => { sides[i].scrollIntoView(); sides[i].focus({ preventScroll: true }); }));
  root.dataset.side = 0;
  document.fonts.ready.then(() => { root.dataset.ready = 'true'; });
} else ringing();

function ringing() {
  /* ---- the drum's faces */
  const faces = sides.map((s, i) => ({ s, i, inner: ins[i], col: $$('.edge.col', s), wash: $('.edge.wash', s), last: {} }));
  const set = (f, k, el, prop, v) => { if (f.last[k] !== v) { f.last[k] = v; el.style[prop] = v; } };
  let r = 0, P = 0, face = 0, drumLast = '';

  /* ---- geometry. Desktop: each side is one viewport of scroll, held square for a quarter, then
     turned over three quarters. Phone: one and a half viewports, half a viewport held square while
     its stacked extras scroll inside it, then one turning. The viewport is the large one (lvh), so the
     phone's address bar showing and hiding never remaps the angle. */
  let seg = 0, hold = 0, over = sides.map(() => 0), y = -1;
  function measure() {
    const vh = probe.getBoundingClientRect().height || innerHeight;
    st.vw = innerWidth; st.vh = vh; st.phone = phoneQ.matches;
    root.classList.toggle('phone', st.phone);
    seg = Math.round(vh * (st.phone ? 1.5 : 1)); hold = Math.round(vh * (st.phone ? 0.5 : 0.25));
    track.style.height = `${N * seg + hold + vh}px`;
    face = vh * (st.phone ? 0.84 : 0.8);
    r = face / (2 * Math.tan(30 * DEG));
    P = r * 1.15;                        // the camera sits a little behind the axis
    root.style.setProperty('--face', `${face}px`);
    root.style.setProperty('--persp', `${P.toFixed(1)}px`);
    faces.forEach((f, i) => { f.s.style.transform = `rotateX(${i * 60}deg) translateZ(${(-r).toFixed(1)}px)`; f.last = {}; });
    over = ins.map((el, i) => Math.max(0, el.scrollHeight - sides[i].clientHeight));
    drumLast = ''; y = -1;
  }
  const angleAt = (yy) => {
    const k = Math.min(Math.floor(yy / seg), N), p = yy - k * seg;
    if (k >= N || p <= hold) return k * STEP;
    return (k + ease(clamp((p - hold) / (seg - hold), 0, 1))) * STEP;
  };
  const sideY = (k) => k * seg;

  /* ---- programmatic scrolls */
  let settleTo = null, settleAt = 0, jump = null, keyFocus = -1, lastInput = 0, touching = false;
  function settle(top, behavior = 'smooth') { settleTo = top; settleAt = performance.now(); scrollTo({ top, behavior }); }
  function go(k, how = 'smooth', fromDot = false) {
    let target = k;
    if (k < 0) target = N - 1;
    if (k > N) target = 1;
    jump = fromDot ? target % N : null;
    if (fromDot) keyFocus = target % N;   // a dot hands focus to its side, so the next Tab reads that side
    settle(sideY(target), how);
  }
  dots.forEach((d, i) => d.addEventListener('click', () => go(i, 'smooth', true)));
  $$('[data-go]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); go(+a.dataset.go); keyFocus = +a.dataset.go; }));

  /* ---- a hand on the page: no settle, no wrap, any running settle yields and the climax ends */
  const handOn = () => { lastInput = performance.now(); settleTo = null; jump = null; keyFocus = -1; if (st.climax) st.climax.out = true; };
  addEventListener('wheel', handOn, { passive: true });
  addEventListener('touchstart', () => { touching = true; handOn(); }, { passive: true });
  addEventListener('touchend', () => { touching = false; lastInput = performance.now(); }, { passive: true });
  addEventListener('touchcancel', () => { touching = false; }, { passive: true });
  // A scroll that is not ours is input. While a settle runs, the page only moves toward its target;
  // a move away from it is a hand (a scrollbar drag, a key, a slow wheel), and the settle yields.
  let lastY = scrollY;
  addEventListener('scroll', () => {
    const yy = scrollY;
    // (the first tenth of a second is the previous scroll's last step, not a hand)
    if (settleTo != null && performance.now() - settleAt > 120 && Math.abs(yy - settleTo) > Math.abs(lastY - settleTo) + 1) { settleTo = null; keyFocus = -1; }
    if (settleTo == null) lastInput = performance.now();
    lastY = yy;
  }, { passive: true });

  /* ---- keyboard: arrows and Page keys turn one side, Home and End jump. Keys on links and buttons
     keep their meaning; Space turns only when focus is on the page itself. */
  addEventListener('keydown', (e) => {
    // any key is a hand on the page: the climax yields, so focus is never on a face in mid-swing
    if (st.climax) st.climax.out = true;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const onCtl = e.target.closest?.('a, button, input, textarea, select');
    const cur = Math.round(st.f);
    let to = null;
    if (e.key === 'ArrowDown' || e.key === 'PageDown' || (e.key === ' ' && !onCtl && !e.shiftKey)) to = cur + 1;
    else if (e.key === 'ArrowUp' || e.key === 'PageUp' || (e.key === ' ' && !onCtl && e.shiftKey)) to = cur - 1;
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = N - 1;
    if (to == null) return;
    e.preventDefault();
    if (st.climax) st.climax.out = true;
    if (to > N) to = 1;
    if (to < 0) { scrollTo({ top: sideY(N), behavior: 'instant' }); to = N - 1; }
    go(to);
    keyFocus = to % N;   // focus follows the turn, so the next Tab starts in the side now in front
  });

  /* ---- focus: Tab walks every side in order and the ring turns to whatever has focus. On a phone a
     focused element in a side's stacked extras sets the dwell so it is on screen. */
  addEventListener('focusin', (e) => {
    const s = e.target.closest?.('.side'); if (!s || e.target === s) return;
    const k = +s.dataset.side;
    let yy = sideY(k);
    if (over[k] > 0) {
      const top = e.target.getBoundingClientRect().top - ins[k].getBoundingClientRect().top;
      const need = clamp(top + e.target.offsetHeight + 24 - s.clientHeight, 0, over[k]);
      yy += Math.round(hold * need / over[k]);
    }
    if (Math.abs(scrollY - yy) < 2) return;
    if (k === 0 && st.f > N - 1.5) yy += N * seg;   // forward from side 6 to Hello turns on, never back through four
    jump = null;
    settle(yy, Math.abs(scrollY - yy) > seg * 1.5 ? 'instant' : 'smooth');
  });

  /* ---- line-up: a side square to the viewer */
  let lastAligned = -1, alignedAt = 0, shownSide = -1, announced = false;
  function lineup(k, now) {
    sides.forEach((s, i) => s.classList.toggle('is-lit', i === k));
    dots.forEach((d, i) => i === k ? d.setAttribute('aria-current', 'step') : d.removeAttribute('aria-current'));
    const passing = jump != null && jump !== k;   // a dot jump turning past a side does not visit it
    if (!passing) { st.visited.add(k); jump = null; }
    // a key turn hands focus to the side it turned to, as soon as that side is square
    if (keyFocus === k) { sides[k].focus({ preventScroll: true }); keyFocus = -1; }
    root.dataset.aligned = k;
    writeReceipt();   // every line-up, so it is current before side 4 comes into view
    root.dataset.visited = [...st.visited].sort().join(',');
    bdot.style.setProperty('--c', PALETTE[k]);
    if (now - alignedAt > 400) { tickAt = now; tickCol = PALETTE[k]; }   // a turn, not the first frame
    alignedAt = now;
    if (!passing && announced) live.textContent = `Side ${k + 1} of ${N}: ${sides[k].dataset.name}`;
    announced = true;
    if (k === 3) {
      // The climax plays from what this visit has turned through; a jump straight here gets a plainly lit ring.
      const prior = [...st.visited].filter((i) => i !== 3).sort();
      // Tab into a link on this side means a keyboard user is reading it: no camera swing under their focus.
      const reading = sides[3].contains(document.activeElement) && document.activeElement !== sides[3];
      const show = prior.length >= 2 && !st.paused && !reading && (!st.climax || st.climax.sides.length < prior.length + 1);
      st.climax = { sides: [...prior, 3].sort(), show, t: now, out: !show, hold: 2400 };
      root.dataset.climax = show ? 'show' : 'plain';
      delete root.dataset.caught;
      if (show) {
        // The game, for one bar: once the camera is down the axis, a ball drops from the centre onto
        // each visited side in turn, on the 120 BPM grid's eighth notes, the contact side last. Each
        // catch rings that side's tone, so the chord builds up as the ring fills.
        // the first drop leaves once the camera is down; the last catch, the contact side's, lands on a beat
        const n = prior.length + 1;
        const first = t0 + Math.ceil((now + 850 + FALL - t0) / BEAT) * BEAT + (n % 2 ? 0 : BEAT / 2);
        st.climax.drops = [...prior, 3].map((k, j) => ({ k, at: first + j * BEAT / 2 }));
        st.climax.hold = Math.max(2400, first + prior.length * BEAT / 2 + 450 - now);
      } else play((a) => a.side(3));
    } else if (!passing) play((a) => a.side(k));
  }
  function leave() {
    sides.forEach((s) => s.classList.remove('is-lit'));
    root.dataset.aligned = '';
    delete root.dataset.climax;
    tap.show(false);
  }

  /* ---- the frame */
  let beatNo = -1, frames = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const cost = performance.now();
    // the first frames lay the page out and load the near sides' pictures; the receipt is the steady state
    try { step(now); } finally { const d = performance.now() - cost; if (++frames > 30) frameMs = frameMs ? frameMs * 0.97 + d * 0.03 : d; }
  }
  function step(now) {
    const yy = Math.max(0, scrollY);
    // input has stopped: no wheel, touch or scroll for a third of a second (a slow wheel's notches
    // come up to a quarter second apart, and the settle must not land between two of them)
    const idle = now - lastInput > IDLE && !touching;
    // the second Hello is the first one: once input stops there, move back to the top unseen
    if (idle && settleTo == null && yy >= N * seg - 1) { scrollTo({ top: yy - N * seg, behavior: 'instant' }); lastInput = now; return; }
    // arrived, or a scrollbar drag cut the smooth scroll short
    if (settleTo != null && (Math.abs(yy - settleTo) < 2 || now - settleAt > 1800)) {
      settleTo = null; lastInput = now - IDLE + 60;
      if (keyFocus >= 0) { sides[keyFocus].focus({ preventScroll: true }); keyFocus = -1; }
    }
    if (idle && settleTo == null) {
      const k = Math.min(Math.floor(yy / seg), N), p = yy - k * seg;
      if (k < N && p > hold + 1) settle((p - hold) / (seg - hold) < 0.5 ? k * seg + hold : (k + 1) * seg);
    }
    if (yy !== y) {
      y = yy; st.angle = angleAt(yy); st.f = st.angle / STEP;
      // stacked extras on a phone scroll inside their side during its hold
      for (let i = 0; i < N; i++) if (over[i]) {
        const p = clamp((yy - i * seg) / hold, 0, 1) * (yy >= i * seg - seg / 2 ? 1 : 0);
        ins[i].style.transform = `translate3d(0,${(-over[i] * p).toFixed(1)}px,0)`;
        const more = p < 0.97;
        if (more !== sides[i].classList.contains('more-below')) sides[i].classList.toggle('more-below', more);
      }
    }
    const k = Math.round(st.f), off = Math.abs(st.f - k) * STEP;
    if (off < 0.6) { if (lastAligned !== k % N) { lastAligned = k % N; lineup(k % N, now); } }
    else if (off > 6 && lastAligned !== -1) { lastAligned = -1; leave(); }
    st.aligned = lastAligned;
    const near = ((k % N) + N) % N;   // the readout and Normal view follow the nearest side, even mid-turn
    if (near !== shownSide) {
      shownSide = near; root.dataset.side = near;
      whereNo.textContent = String(near + 1).padStart(2, '0'); whereName.textContent = sides[near].dataset.name;
      normal.href = sides[near].dataset.normal;
      // the dot changes with the readout, at the half-way point of a turn, so the two never disagree
      dots.forEach((d, i) => i === near ? d.setAttribute('aria-current', 'step') : d.removeAttribute('aria-current'));
    }
    // pictures for the sides within one turn
    for (let i = 0; i < N; i++) if (Math.abs(wrap((i - st.f) * STEP)) <= STEP * 1.05) loadImages(i);

    const ph = ((now - t0) % BEAT + BEAT) % BEAT, b = Math.floor((now - t0) / BEAT);
    st.pulse = st.paused ? 0 : Math.exp(-ph / 150);
    if (b !== beatNo) {
      beatNo = b;
      if (!st.paused && Math.abs(st.f - 1) < 1) net.beat(now);
      // the beat is heard with side 2's packets, and on side 3 once the hint asks for a tap (each tick
      // is booked a beat ahead, so the first is heard one beat in)
      if (!st.paused && (st.aligned === 1 || (st.aligned === 2 && root.classList.contains('tapping')))) play((a) => a.tick());
    }
    drawBeat(ph, now);
    if (Math.abs(st.f - 1) < 1.2) net.draw(now, st.paused);
    tap.show(st.aligned === 2 && now - alignedAt > 2000);
    tap.frame(now, ph);
    const d5 = Math.abs(wrap((4 - st.f) * STEP)) / STEP;
    // the G-code is fetched once side 4 is square (after its receipt is written, so Contact's counter
    // never shows bytes for a side the viewer has not reached) or when side 5 is close from the other
    // way; side 4's own dwell covers the download, and the rise waits for the file
    if (st.aligned === 3 || d5 < 0.6) plateNear();
    plate?.frame(now, d5 < 1.2, st.aligned === 4);
    render(now);
  }

  /* ---- side 4's catches. The ball is PolyBall's: it leaves the centre of the ring and falls an
     eighth note onto a side's rim. Drawn on a canvas that exists only while the show runs. */
  let cc = null, cg = null, aim = null;
  function catches(now, c) {
    const on = c?.show && c.outAt == null && c.drops;
    if (!on) { if (cg && !(st.f > 2.35 && st.f < 3)) { cc.hidden = true; cg = null; aim = null; } return; }   // a hand on the page ends it (the warm canvas stays up until the show or the turn away)
    if (now < c.drops[0].at - FALL) return;
    if (!cc) { cc = document.body.appendChild(document.createElement('canvas')); cc.className = 'burst'; cc.setAttribute('aria-hidden', 'true'); }
    if (!cg) { cc.hidden = false; cg = fitCanvas(cc, innerWidth, innerHeight); }
    const cx = innerWidth / 2, cy = innerHeight / 2, R = Math.max(6, Math.min(innerWidth, innerHeight) * 0.02);
    // Down the axis on side 4, side k's face lies at -60k degrees round the centre (the contact side on
    // the left). How far out its band runs is read once, off the contact face's box, which stands
    // upright: far rim at its right edge, near rim at its left. The ball lands a third of the way out.
    if (!aim) {
      const b = sides[3].getBoundingClientRect(), far = cx - b.right, near = cx - b.left, rho = far + (near - far) * 0.3;
      aim = new Map(c.drops.map(({ k }) => [k, [cx + Math.cos(-k * 60 * DEG) * rho, cy + Math.sin(-k * 60 * DEG) * rho]]));
    }
    cg.clearRect(0, 0, innerWidth, innerHeight);
    let caught = 0;
    for (const d of c.drops) {
      const s = (now - d.at + FALL) / FALL;
      if (s < 0) continue;
      if (!d.rang) { d.rang = true; play((a) => a.bell(d.k, d.at, d === c.drops[0] ? 'first' : d === c.drops[c.drops.length - 1] ? 'last' : '')); }
      const [tx, ty] = aim.get(d.k), col = PALETTE[d.k];
      if (s < 1) {
        // falling: it speeds up toward the rim, as in the game, with a short trail
        for (const [lag, al] of [[0.16, 0.18], [0.08, 0.4], [0, 1]]) {
          const u = Math.max(0, s - lag) ** 2;
          cg.globalAlpha = al; cg.fillStyle = col;
          cg.beginPath(); cg.arc(cx + (tx - cx) * u, cy + (ty - cy) * u, R, 0, 6.2832); cg.fill();
        }
        const u = s * s;
        cg.globalAlpha = 1; cg.fillStyle = '#FFF8EC';
        cg.beginPath(); cg.arc(cx + (tx - cx) * u, cy + (ty - cy) * u, R * 0.45, 0, 6.2832); cg.fill();
      } else {
        caught++;
        const b = (now - d.at) / 520;
        if (b < 1) {
          cg.globalAlpha = 1 - b; cg.strokeStyle = col; cg.lineWidth = 3;
          cg.beginPath(); cg.arc(tx, ty, R + 64 * ease(b), 0, 6.2832); cg.stroke();
        }
      }
    }
    cg.globalAlpha = 1;
    if (caught !== c.caught) { c.caught = caught; root.dataset.caught = c.drops.slice(0, caught).map((d) => d.k).join(','); }
  }

  /* ---- the drum: the face in front square, the next swinging in from below. On side 4 the camera
     swings down the axis so the hexagon shows whole for one bar, every visited face lit. */
  function render(now) {
    let yaw = 0, zc = r, glowAll = 0;
    const c = st.climax;
    if (c?.show) {
      const IN = 850, HOLD = c.hold, OUT = 950, t = now - c.t;
      // a hand on the scroll or a key ends the show at once, from wherever it has got to
      if (c.out && c.outAt == null) { c.outAt = now; c.from = c.k ?? 0; }
      const k = c.outAt != null ? Math.max(0, c.from * (1 - (now - c.outAt) / OUT))
        : t < IN ? t / IN : t < HOLD ? 1 : t < HOLD + OUT ? 1 - (t - HOLD) / OUT : 0;
      c.k = k;
      const e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
      // down the axis: the near rim of the hexagon fits the screen
      const sc = Math.min(0.42 * st.vh / (r / Math.cos(30 * DEG)), 0.42 * st.vw / r);
      const zt = P - P / sc - st.vw / 2;
      yaw = 90 * e; zc = r + (zt - r) * e; glowAll = e;
      if (k <= 0 && (c.outAt != null || t > HOLD)) c.show = false;
    }
    catches(now, c);
    // On the way from side 3 to side 4 the show's layers are put up early, at zero opacity: the three
    // faces round the back, every face's wash and the catches canvas. Their first paint then falls in
    // the turn, a few milliseconds a frame, not all in the show's first frame.
    const warm = st.f > 2.35 && st.f < 3 && !c?.show;
    if (warm && !cg) { cc ||= Object.assign(document.body.appendChild(document.createElement('canvas')), { className: 'burst' }); cc.setAttribute('aria-hidden', 'true'); cc.hidden = false; cg = fitCanvas(cc, innerWidth, innerHeight); }
    const tf = `translateZ(${zc.toFixed(1)}px) rotateY(${yaw.toFixed(2)}deg) rotateX(${(-st.angle).toFixed(3)}deg)`;
    if (tf !== drumLast) { drumLast = tf; drum.style.transform = tf; }
    const game = Math.max(0, 1 - Math.abs(st.f - 2) * 1.6);   // side 3 brings the game's colours to the faces near it
    const breath = 0.78 + 0.22 * st.pulse;
    for (const f of faces) {
      const near = Math.abs(wrap(f.i * 60 - st.angle));
      set(f, 'vis', f.s, 'visibility', near > 100 && !glowAll && !warm ? 'hidden' : 'visible');
      const lit = Math.max(0, 1 - near / 18);
      const shown = c?.sides.includes(f.i) ? glowAll : 0;
      const col = Math.max(lit * breath, game * 0.85 * (near < 70 ? 1 : 0), shown, near < 70 ? 0.32 : 0);
      const c2 = col.toFixed(2);
      if (f.last.col !== c2) { f.last.col = c2; for (const e of f.col) e.style.opacity = c2; }
      set(f, 'wash', f.wash, 'opacity', (shown * (st.phone ? 1 : 0.9)).toFixed(2));
      set(f, 'washv', f.wash, 'visibility', shown > 0 || warm ? 'visible' : 'hidden');   // off the compositor when unlit
      set(f, 'in', f.inner, 'opacity', (Math.max(0.12, 1 - near / 52) * (1 - glowAll * 0.85)).toFixed(2));
    }
  }

  let lastW = innerWidth, lastVh = 0;
  const remeasure = () => {
    const vh = probe.getBoundingClientRect().height;
    if (innerWidth === lastW && Math.abs(vh - lastVh) < 1) return;   // the address bar, not a resize
    lastW = innerWidth; lastVh = vh;
    const f = st.f; measure();
    scrollTo({ top: Math.round(f) === f ? sideY(f) : scrollY, behavior: 'instant' });
  };
  addEventListener('resize', remeasure);
  phoneQ.addEventListener('change', () => { lastW = -1; remeasure(); });
  measure(); lastVh = st.vh;
  onImages = (k) => { over[k] = Math.max(0, ins[k].scrollHeight - sides[k].clientHeight); };
  dots.forEach((d) => { d.title = d.getAttribute('aria-label').replace(/^Side \d of \d: /, ''); });   // the name on hover
  scrollTo(0, 0);
  lineup(0, performance.now()); lastAligned = 0;
  root.dataset.side = 0;
  // a deep link (/ring/#contact) opens on that side, as a jump: plainly lit, nothing to pay off yet
  const linked = sides.findIndex((s) => '#' + s.id === location.hash);
  if (linked > 0) go(linked, 'instant', true);
  requestAnimationFrame(frame);
  document.fonts.ready.then(() => {
    over = ins.map((el, i) => Math.max(0, el.scrollHeight - sides[i].clientHeight));
    root.dataset.ready = 'true';
  });
}
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
