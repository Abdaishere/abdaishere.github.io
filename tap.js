/* Tap on the beat: the status bar's beat item, on every page that has a status bar.
 *
 * Where the page has a trace (home, /e-jam/), the item plays on the trace's 120 BPM clock, and a tap
 * on the hero is judged against that clock too, with PolyBall's own PERFECT window (ball.gd
 * PERFECT_BEAT_WINDOW, 0.06 s either side): on the beat, the burst leaves amber and the streak grows;
 * off it, the burst leaves red, stops dead at the switch, and the streak is over.
 *
 * Where it has none (/cv/, /polyball/, the note, the leaderboard), the item keeps its own clock and
 * rests until pressed: nothing on those pages moves by itself, and they have no Pause to stop a ring
 * that pulsed forever (WCAG 2.2.2). The first press is a count-in: the clock starts on that press and
 * nothing is judged; from the next beat on it plays as above. It rests again when the run ends.
 *
 * Judged on pointerdown, so the burst leaves at once; counted on pointerup. A pointercancel means the
 * finger started a scroll, so that judgement is thrown away and the page scrolls as it always did.
 * Holding still pumps the plain stream (trace.js) and never counts.
 *
 * The item has one slot of fixed width: "120 BPM · Tap" at rest, "Count-in", "3 on the beat" while a
 * run lives, "151 ms late" for 3 s after a miss. A run ends on a miss or after 4 s (8 beats) without a
 * tap, so a count on show is always a current run. Nothing here changes the item's size.
 *
 * Sound is off until asked for. On, each tap on the beat plays the next chord of the game's loop
 * (Am F C G Am F C E7) in the game's chime voice (band.js, copied from sfx.gd, fetched on the first
 * Sound press); a miss is silence and goes back to Am, as a miss ends a run in the game. The Sound
 * choice and the visit's best run carry from page to page (sessionStorage); audio itself can only
 * start inside a press, so a carried-over Sound starts with the first one.
 *
 *   const t = taps();   // before start(): trace needs t.onTap
 *   const trace = start(canvas, { onTap: t.onTap, ... }); t.bind(trace, pauseButton);
 *   taps().bind();      // a page with no trace (site.js does this)
 */
const WINDOW = 60;   // ms either side of the beat: the game's PERFECT window
const BEAT = 500;   // the trace's clock, 120 BPM
const RUN = 4000, MISS = 3000;   // how long a run lives without a tap, how long a miss stays up
// ponytail: a fixed input-latency trim, 0 until measured on a real mid-range Android. If honest taps
// there land late by a steady amount, put the median here (ms) and every judgement shifts by it.
const TRIM = 0;
const KEY = 'beat-v1';
const stored = () => { try { return JSON.parse(sessionStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
let M = null, band = null;   // band.js, once fetched
const voices = () => band ||= import('/polyball/band.js').then((m) => (M = m));

// A page with no trace: the same offset maths on its own clock, which runs only from a count-in to
// the end of that run.
function own() {
  let t0 = 0, on = false;
  return {
    mode: 'own', paused: () => false, shot() {}, on: () => on, start(ts) { t0 = ts; on = true; }, stop() { on = false; },
    offset: (ts) => { const ph = (((ts - t0) % BEAT) + BEAT) % BEAT; return ph > BEAT / 2 ? ph - BEAT : ph; },
  };
}

// QA ST-02: restLabel overrides the rest-state text. The widget's own clock
// (BEAT, above) is a generic UI pace shared by every no-trace page and stays
// 120 regardless; only /polyball/ passes a different label here, because
// that page's actual game runs at 100 BPM (band.js), and a NUMBER on this
// page has to either match the widget's own clock (120, still wrong versus
// the game) or the game (100, wrong versus the widget it is actually tapping
// along to) - no single number is honest, so this page drops it instead.
export function taps({ item = document.getElementById('beatitem'), tap = document.getElementById('tap'), sound = document.getElementById('sound'), line = document.getElementById('streak'), status = document.getElementById('tap-status'), restLabel = '120 BPM · Tap' } = {}) {
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  const ring = item.querySelector('.sb-ring'), fill = item.querySelector('.sb-fill');
  let trace = null, solo = false, pending = null, streak = 0, best = 0, shown = null, timer = 0, ac = null, voice = null, bus = null;

  const judge = (ms) => ({ ms: Math.round(ms - TRIM), hit: Math.abs(ms - TRIM) <= WINDOW });
  const live = () => trace && !calm.matches && trace.mode !== 'none' && !trace.paused();
  const running = () => live() && (!solo || trace.on());
  const soundOn = () => sound.getAttribute('aria-pressed') === 'true';
  const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify({ sound: soundOn(), best })); } catch (e) {} };

  // The slot: a run's count in amber, everything else in the bar's own colour. A miss is words only:
  // the red is for the stream, never for text.
  const say = (...parts) => line.replaceChildren(...parts.map((p) => typeof p === 'string' ? p : Object.assign(document.createElement('b'), { textContent: p[0] })));
  const render = () => {
    if (trace?.paused()) say('Paused');
    else if (shown === 'in') say('Count-in');
    else if (shown?.hit) say([String(streak)], streak >= 100 ? ' on beat' : ' on the beat');   // 100+ would not fit the slot
    else if (shown) say(`${Math.abs(shown.ms)} ms ${shown.ms > 0 ? 'late' : 'early'}`);
    else say(restLabel);
  };
  const rest = () => { clearTimeout(timer); streak = 0; shown = null; if (solo) trace.stop(); render(); go(); };

  // Audio can only start inside a press (iOS: a touchend or a click), so every press calls this.
  function audio() {
    if (!soundOn() || !window.AudioContext) return;
    if (!ac) {
      ac = new AudioContext();
      bus = ac.createGain(); bus.gain.value = 0.8;
      bus.connect(ac.createDynamicsCompressor()).connect(ac.destination);
    }
    if (!voice) M ? voice = M.voicer(ac, bus) : voices().then(() => { voice ||= M.voicer(ac, bus); });
    if (ac.state !== 'running' && !document.hidden) ac.resume();
  }
  function commit(j, ts) {
    clearTimeout(timer);
    audio();
    if (j === 'in') { trace.start(ts); shown = 'in'; render(); go(); timer = setTimeout(rest, RUN); return; }
    if (j.hit) {
      streak++;
      if (streak > best) { best = streak; save(); }
      if (voice && soundOn()) {
        const c = M.CHORD_MIDI[(streak - 1) % 8];
        for (let i = 0; i < 3; i++) voice(M.CHIME, c[i], ac.currentTime, -20);
      }
    } else {
      streak = 0;
      status.textContent = `${Math.abs(j.ms)} ms ${j.ms > 0 ? 'late' : 'early'}.` + (best ? ` Best this visit: ${best}.` : '');
    }
    shown = j; render();
    timer = setTimeout(rest, j.hit ? RUN : MISS);
  }
  // A press on the item: a count-in if its own clock is at rest, otherwise a judgement.
  const press = (ts) => solo && !trace.on() ? 'in' : judge(trace.offset(ts));

  // called by trace.js on every press on the hero, with the signed distance from the beat in ms
  const onTap = (ms) => {
    const j = live() ? judge(ms) : null;
    pending = j && { j };
    return !j ? 0 : j.hit ? 1 : 2;
  };

  // On the window: a press on the status item lifts outside the hero, and a drag can end anywhere.
  addEventListener('pointerup', () => { if (pending) commit(pending.j, pending.ts); pending = null; });
  addEventListener('pointercancel', () => { pending = null; });

  // The keyboard's way in: judged on keydown, since a button's own activation on Space waits for keyup
  // and would judge every keyboard tap late. A pointer press is judged on pointerdown like any press
  // on the hero, and its burst leaves from the hero's left.
  tap.addEventListener('keydown', (e) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    if (e.repeat || !live()) return;
    const j = press(e.timeStamp);
    if (j !== 'in') trace.shot(j.hit ? 1 : 2);
    commit(j, e.timeStamp);
  });
  tap.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || !live()) return;
    const j = press(e.timeStamp);
    if (j !== 'in') trace.shot(j.hit ? 1 : 2);
    pending = { j, ts: e.timeStamp };
  });
  tap.addEventListener('click', audio);

  sound.addEventListener('click', () => {
    const on = !soundOn();
    sound.setAttribute('aria-pressed', String(on));
    save();
    on ? audio() : ac?.suspend();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && solo) rest();
    if (!ac) return;
    document.hidden || !soundOn() ? ac.suspend() : ac.resume();
  });

  /* The pulse: a ring that closes onto the dot's outline over each 500 ms beat and meets it on the
   * beat, so the beat can be seen coming (a flash alone is always reacted to late, and the window is
   * 60 ms). The dot fills as they meet, holds 100 ms, and fades over 150 ms; the next ring fades in
   * over those same first 150 ms, already moving, so on the beat only the filled dot shows. Every
   * frame reads the phase straight off the clock (trace.offset), so the item cannot drift from the
   * bursts. Runs only while the item is on screen, the clock is running and the tab is visible. */
  let raf = 0, seen = false;
  const last = { r: '', o: '' };
  const dpr = Math.min(3, devicePixelRatio || 1); ring.width = ring.height = Math.round(20 * dpr);
  const g = ring.getContext('2d'); g.scale(dpr, dpr); g.lineWidth = 1.5;
  const ink = () => { g.strokeStyle = getComputedStyle(ring).color; last.r = ''; };   // the ring's colour is its CSS color: --mut
  ink(); document.addEventListener('theme-change', () => requestAnimationFrame(ink)); matchMedia('(prefers-color-scheme: dark)').addEventListener('change', ink);
  const frame = (now) => {
    raf = 0;
    if (!running() || !seen || document.hidden) return idle();
    const ms = trace.offset(now), ph = ms < 0 ? ms + BEAT : ms;           // ms since the last beat
    // A canvas, not a resized element: resizing an element, or transforming an SVG one, lays the page
    // out again every frame (measured, about 1 ms), and a CSS scale would thin the stroke with it.
    const r = (3.25 + 6 * (1 - ph / BEAT)).toFixed(1), a = Math.min(1, ph / 150).toFixed(2), o = ph < 100 ? '1' : Math.max(0, 1 - (ph - 100) / 150).toFixed(2);
    if (r + a !== last.r) { last.r = r + a; g.clearRect(0, 0, 20, 20); g.globalAlpha = +a; g.beginPath(); g.arc(10, 10, +r, 0, 6.2832); g.stroke(); }
    if (o !== last.o) fill.style.opacity = last.o = o;
    raf = requestAnimationFrame(frame);
  };
  const idle = () => { item.classList.toggle('held', !calm.matches && !!trace && trace.paused()); fill.style.opacity = last.o = '0'; g.clearRect(0, 0, 20, 20); last.r = ''; };
  function go() { if (!raf && running() && seen && !document.hidden) raf = requestAnimationFrame(frame); else if (!running()) idle(); }
  new IntersectionObserver(([e]) => { seen = e.isIntersecting; go(); }).observe(item);
  document.addEventListener('visibilitychange', go);

  const sync = () => {
    tap.setAttribute('aria-disabled', String(!live()));
    item.classList.toggle('held', !calm.matches && !!trace && trace.paused());
    render(); go();
  };
  // What another page left: the Sound choice and the visit's best. Read again when the browser brings
  // this page back from its back/forward cache, since another page may have changed both meanwhile.
  const restore = () => {
    const s = stored();
    best = Math.max(0, s.best | 0);
    sound.setAttribute('aria-pressed', String(!!s.sound));
    if (s.sound) (window.requestIdleCallback || setTimeout)(voices);   // so the first press does not wait on a fetch
    else ac?.suspend();
  };
  restore();
  addEventListener('pageshow', (e) => { if (e.persisted) { restore(); rest(); } });
  return {
    onTap,
    bind(t, pause) { trace = t || own(); solo = !t; sync(); pause?.addEventListener('click', sync); },
    state: () => ({ streak, best, sound: ac?.state || 'none', line: line.textContent, own: solo, running: running() }),   // for the gate
    offset: (ts) => trace.offset(ts),   // the clock the item plays on, trace or its own (the gate aims with it)
  };
}
