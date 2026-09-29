/* Fig. 05, part three: "Find throughput", RFC 2544's throughput test run on the drawing.
 *
 * What E-Jam's documentation says the throughput preset does: "binary search for the rate to send
 * packets: count the total number of packets sent and received. If no packets are dropped, then we
 * have found a lower bound on the throughput", each trial at least 30 s and the final determination
 * trial at least 60 s. This does exactly that, on a switch whose forwarding limit is hidden and
 * picked at random for every run, so the reader can check the search against the limit it reveals:
 *   - the first trial runs at line rate (the frame-loss preset's first trial does too)
 *   - pass = zero frames lost; a pass raises the floor, a fail lowers the ceiling, the next trial is
 *     the midpoint, and the search stops when floor and ceiling are under half a percent apart
 *   - then one final trial at the found rate, twice as long, labelled final
 * A trial here is two beats of the site's 120 BPM clock (1 s), the final one four.
 *
 * The number line and the text are DOM, so the test runs the same with no WebGL and under reduced
 * motion (text changing is not motion; showing every mark at once would hide the search, which is
 * the point). With the three.js scene up, the packets thin with the rate and the frames over the
 * limit stop at the switch's outer ring (scene.js setTest). Pause stops the test clock too.
 *
 *   const p = probe(root, { scene: () => sceneApi, feed: () => ({ sending, blind }), lock, paused });
 */
const TRIAL = 1, FINAL = 2, STOP = 0.5;   // seconds per trial, seconds for the final one, % resolution
const PER = 500;                          // frames one stream offers per second at line rate, in this drawing

// Trial rates are halvings of 100, so two decimals show them exactly enough (96.88, 95.31) and keep a
// found rate from rounding up onto the limit it sits under.
const pct = (r) => `${r.toLocaleString('en-GB', { maximumFractionDigits: 2 })}%`;
// the limit always at two decimals, so it reads at the same precision as the rate found under it
const pct2 = (r) => `${r.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const NS = 'http://www.w3.org/2000/svg';

export function probe(root, { scene, feed, lock, paused }) {
  const run = root.querySelector('#probe-run'), now = root.querySelector('#probe-now');
  const svg = root.querySelector('#nline'), result = root.querySelector('#probe-result'), note = root.querySelector('#probe-note');
  let t = null, timer = 0;   // t: the run in progress

  function mark(el, attrs, text) { const n = document.createElementNS(NS, el); for (const k in attrs) n.setAttribute(k, attrs[k]); if (text != null) n.textContent = text; svg.appendChild(n); return n; }
  function drawLine() {
    const W = Math.max(200, svg.clientWidth), pad = 14, x = (r) => pad + (r / 100) * (W - 2 * pad), y = 56;
    svg.setAttribute('viewBox', `0 0 ${W} 112`);
    svg.replaceChildren();
    if (t && t.hi - t.lo < 100) mark('rect', { class: 'nl-gap', x: x(t.lo), y: y - 9, width: Math.max(1, x(t.hi) - x(t.lo)), height: 18 });
    mark('line', { class: 'nl-axis', x1: x(0), x2: x(100), y1: y, y2: y });
    for (const r of [0, 25, 50, 75, 100]) {
      mark('line', { class: 'nl-axis', x1: x(r), x2: x(r), y1: y - 4, y2: y + 4 });
      mark('text', { class: 'nl-tick', x: x(r), y: 110, 'text-anchor': r === 0 ? 'start' : r === 100 ? 'end' : 'middle' }, `${r}%`);
    }
    if (!t) return;
    // At the end the answer sits on the line: the found rate under its cluster, the revealed limit as
    // a tick just above it. Trial numbers give way to both there, and anywhere marks are under 16 px apart.
    // the limit's label gets a row of its own above the fail numbers, and fail numbers near it give way
    const found = t.over && t.lo > 0, lx = x(t.limit), flip = lx > W - 60;
    // the answer is centred on its rate but kept inside the line, and trial numbers stay clear of it
    const ansW = pct(t.lo).length * 7.3, ansX = Math.min(Math.max(x(t.lo), pad + ansW / 2), W - pad - ansW / 2);
    const busy = (cx) => found && Math.abs(cx - ansX) < ansW / 2 + 12;
    const nearLimit = (cx) => t.over && (flip ? cx > lx - 52 && cx < lx + 16 : cx > lx - 16 && cx < lx + 52);
    const room = { up: -1e9, down: -1e9 };
    for (const tr of [...t.trials].sort((a, b) => a.rate - b.rate)) {
      const cx = x(tr.rate);
      if (tr.pass) {
        mark('circle', { class: 'nl-pass', cx, cy: y + 13, r: 4 });
        if (cx - room.down >= 16 && !busy(cx)) { mark('text', { class: 'nl-n', x: cx, y: y + 30, 'text-anchor': 'middle' }, tr.n); room.down = cx; }
      } else {
        mark('rect', { class: 'nl-fail', x: cx - 4, y: y - 17, width: 8, height: 8 });
        mark('path', { class: 'nl-x', d: `M${cx - 3} ${y - 16}l6 6m0 -6l-6 6` });
        if (cx - room.up >= 16 && !busy(cx) && !nearLimit(cx)) { mark('text', { class: 'nl-n', x: cx, y: y - 24, 'text-anchor': 'middle' }, tr.n); room.up = cx; }
      }
    }
    if (t.cur && !t.over) mark('circle', { class: 'nl-cur', cx: x(t.cur.rate), cy: y, r: 4 });   // the trial running now
    if (t.over) {
      mark('line', { class: 'nl-lim', x1: lx, x2: lx, y1: y - 46, y2: y + 12 });
      // "limit" reads to the right of its tick unless the edge is too close
      mark('text', { class: 'nl-tick', x: flip ? lx - 4 : lx + 4, y: y - 38, 'text-anchor': flip ? 'end' : 'start' }, 'limit');
      if (found) mark('text', { class: 'nl-ans', x: ansX, y: y + 30, 'text-anchor': 'middle' }, pct(t.lo));
    }
  }
  new ResizeObserver(drawLine).observe(svg);

  const trialAt = (rate, final = false) => { t.cur = { n: t.trials.length + 1, rate, final, left: final ? FINAL : TRIAL }; scene()?.setTest({ rate: rate / 100, limit: t.limit / 100 }); show(); };
  // One line of segments, each kept whole, so a narrow screen breaks between them, never inside one.
  const say = (...parts) => now.replaceChildren(...parts.map((s, i) => Object.assign(document.createElement('span'), { textContent: (i ? ' · ' : '') + s })));
  const head = (c) => [c.final ? 'Final trial' : 'Trial ' + c.n, `${pct(c.rate)} of line rate`];
  function show() { say(...head(t.cur), 'running'); drawLine(); }

  function finishTrial() {
    const c = t.cur, f = feed(), sent = Math.round(f.sending * PER * (c.rate / 100) * (c.final ? FINAL : TRIAL));
    const over = Math.max(0, c.rate - t.limit) / c.rate, share = f.sending ? f.blind / f.sending : 0;
    // rounded up: a rate even a hair over the limit loses at least one frame, so it can never pass
    const lost = Math.ceil(sent * (share + (1 - share) * over));
    const tr = { ...c, pass: lost === 0, lost };
    t.trials.push(tr);
    say(...head(c), `${lost.toLocaleString('en-GB')} lost`, tr.pass ? 'pass' : 'fail');
    if (c.final) return done();
    if (tr.pass) t.lo = c.rate; else t.hi = c.rate;
    drawLine();
    if (t.hi - t.lo < STOP) return t.lo > 0 ? trialAt(t.lo, true) : done();
    trialAt((t.lo + t.hi) / 2);
  }

  function done(stopped = false) {
    clearInterval(timer); timer = 0;
    scene()?.setTest(null);
    lock(false);
    run.textContent = 'Run again';
    const n = t.trials.length;
    if (stopped) result.textContent = `Stopped after ${n} ${n === 1 ? 'trial' : 'trials'}. The switch was set to drop above ${pct2(t.limit)}.`;
    else if (!t.lo) result.textContent = 'No rate passed with zero loss. A stream nobody verifies counts every frame as lost.';
    else result.textContent = `Throughput in this drawing: ${pct(t.lo)} of line rate, ${n} trials. The switch was set to drop above ${pct2(t.limit)}.`;
    // the answer takes the top slot; the last trial and the real durations go under the line
    note.textContent = `${stopped ? '' : now.textContent + '. '}Each trial here lasts a second. In E‑Jam each runs at least 30 s, the last at least 60 s.`;
    now.hidden = true; note.hidden = false;
    t.over = true;
    drawLine();
  }

  // The test clock: advances only while the figure is playing and the tab is visible.
  function tick() {
    const at = performance.now(), dt = Math.min(0.25, (at - t.at) / 1000); t.at = at;
    if (paused() || document.hidden) return;
    t.cur.left -= dt;
    if (t.cur.left <= 0) finishTrial();
  }

  run.addEventListener('click', () => {
    if (t && !t.over) return done(true);
    const f = feed();
    if (!f.sending) { now.hidden = true; result.textContent = 'Nothing is being sent. Turn a generator on first.'; return; }
    // the hidden limit: somewhere from 80% to 98% of line rate, to a tenth of a percent
    t = { limit: Math.round(800 + Math.random() * 180) / 10, lo: 0, hi: 100, trials: [], at: performance.now(), over: false };
    result.textContent = ''; note.hidden = true; now.hidden = false;
    run.textContent = 'Stop test';
    lock(true);
    trialAt(100);
    timer = setInterval(tick, 50);
  });

  return { running: () => !!t && !t.over, last: () => t && { ...t, trials: t.trials.slice() } };   // for the gate
}
