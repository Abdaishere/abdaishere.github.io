/* Tap on the beat: the home hero's clock, made playable.
 *
 * The trace already fires on a 120 BPM clock. A tap on the hero is judged against that clock with
 * PolyBall's own PERFECT window (ball.gd PERFECT_BEAT_WINDOW, 0.06 s either side): on the beat, the
 * burst leaves amber and the streak grows; off it, the burst leaves red, stops dead at the switch,
 * and the streak is over. The beat item in the status bar shows the beat coming and reads the result.
 *
 * Judged on pointerdown, so the burst leaves at once; counted on pointerup. A pointercancel means the
 * finger started a scroll, so that judgement is thrown away and the page scrolls as it always did.
 * Holding still pumps the plain stream (trace.js) and never counts.
 *
 * The item has one slot of fixed width: "120 BPM · Tap" at rest, "3 on the beat" while a run lives,
 * "151 ms late" for 3 s after a miss. A run ends on a miss or after 4 s (8 beats) without a tap, so a
 * count on show is always a current run. Nothing here changes the item's size.
 *
 * Sound is off until asked for. On, each tap on the beat plays the next chord of the game's loop
 * (Am F C G Am F C E7) in the game's chime voice (band.js, copied from sfx.gd); a miss is silence and
 * goes back to Am, as a miss ends a run in the game.
 *
 *   const t = taps({ item, tap, sound, line, status });   // before start(): trace needs t.onTap
 *   const trace = start(canvas, { onTap: t.onTap, ... }); t.bind(trace, pauseButton);
 */
import { voicer, CHIME, CHORD_MIDI } from '/polyball/band.js';

const WINDOW = 60;   // ms either side of the beat: the game's PERFECT window
const BEAT = 500;   // the trace's clock, 120 BPM
const RUN = 4000, MISS = 3000;   // how long a run lives without a tap, how long a miss stays up
// ponytail: a fixed input-latency trim, 0 until measured on a real mid-range Android. If honest taps
// there land late by a steady amount, put the median here (ms) and every judgement shifts by it.
const TRIM = 0;

export function taps({ item, tap, sound, line, status }) {
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  const ring = item.querySelector('.sb-ring'), fill = item.querySelector('.sb-fill');
  let trace = null, pending = null, streak = 0, best = 0, shown = null, timer = 0, ac = null, voice = null, bus = null;

  const judge = (ms) => ({ ms: Math.round(ms - TRIM), hit: Math.abs(ms - TRIM) <= WINDOW });
  const live = () => trace && !calm.matches && trace.mode !== 'none' && !trace.paused();

  // The slot: a run's count in amber, everything else in the bar's own colour. A miss is words only:
  // the red is for the stream, never for text.
  const say = (...parts) => line.replaceChildren(...parts.map((p) => typeof p === 'string' ? p : Object.assign(document.createElement('b'), { textContent: p[0] })));
  const render = () => {
    if (trace?.paused()) say('Paused');
    else if (shown?.hit) say([String(streak)], streak >= 100 ? ' on beat' : ' on the beat');   // 100+ would not fit the slot
    else if (shown) say(`${Math.abs(shown.ms)} ms ${shown.ms > 0 ? 'late' : 'early'}`);
    else say('120 BPM · Tap');
  };
  const rest = () => { streak = 0; shown = null; render(); };
  function commit(j) {
    clearTimeout(timer);
    if (j.hit) {
      streak++; best = Math.max(best, streak);
      if (sound.getAttribute('aria-pressed') === 'true' && ac) {
        const c = CHORD_MIDI[(streak - 1) % 8];
        for (let i = 0; i < 3; i++) voice(CHIME, c[i], ac.currentTime, -20);
      }
    } else {
      streak = 0;
      status.textContent = `${Math.abs(j.ms)} ms ${j.ms > 0 ? 'late' : 'early'}.` + (best ? ` Best this visit: ${best}.` : '');
    }
    shown = j; render();
    timer = setTimeout(rest, j.hit ? RUN : MISS);
  }

  // called by trace.js on every press on the hero, with the signed distance from the beat in ms
  const onTap = (ms) => {
    pending = live() ? judge(ms) : null;
    if (!pending) return 0;
    return pending.hit ? 1 : 2;
  };

  // On the window: a press on the status item lifts outside the hero, and a drag can end anywhere.
  addEventListener('pointerup', () => { if (pending) commit(pending); pending = null; });
  addEventListener('pointercancel', () => { pending = null; });

  // The keyboard's way in: judged on keydown, since a button's own activation on Space waits for keyup
  // and would judge every keyboard tap late. A pointer press is judged on pointerdown like any press
  // on the hero, and its burst leaves from the hero's left.
  tap.addEventListener('keydown', (e) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    if (e.repeat || !live()) return;
    const j = judge(trace.offset(e.timeStamp));
    trace.shot(j.hit ? 1 : 2);
    commit(j);
  });
  tap.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || !live()) return;
    pending = judge(trace.offset(e.timeStamp));
    trace.shot(pending.hit ? 1 : 2);
  });

  sound.addEventListener('click', () => {
    const on = sound.getAttribute('aria-pressed') !== 'true';
    sound.setAttribute('aria-pressed', String(on));
    if (on && !ac && window.AudioContext) {   // made on the first press, which is what unlocks iOS
      ac = new AudioContext();
      bus = ac.createGain(); bus.gain.value = 0.8;
      bus.connect(ac.createDynamicsCompressor()).connect(ac.destination);
      voice = voicer(ac, bus);
    }
    if (ac) on ? ac.resume() : ac.suspend();
  });
  document.addEventListener('visibilitychange', () => {
    if (!ac) return;
    document.hidden || sound.getAttribute('aria-pressed') !== 'true' ? ac.suspend() : ac.resume();
  });

  /* The pulse: a ring that closes onto the dot's outline over each 500 ms beat and meets it on the
   * beat, so the beat can be seen coming (a flash alone is always reacted to late, and the window is
   * 60 ms). The dot fills as they meet, holds 100 ms, and fades over 150 ms; the next ring fades in
   * over those same first 150 ms, already moving, so on the beat only the filled dot shows. Every
   * frame reads the phase straight off the trace's own clock (trace.offset), so the item cannot
   * drift from the bursts. Runs only while the item is on screen, the trace is playing and the tab
   * is visible. */
  let raf = 0, seen = false;
  const last = { r: '', o: '' };
  const dpr = Math.min(3, devicePixelRatio || 1); ring.width = ring.height = Math.round(20 * dpr);
  const g = ring.getContext('2d'); g.scale(dpr, dpr); g.lineWidth = 1.5;
  const ink = () => { g.strokeStyle = getComputedStyle(ring).color; last.r = ''; };   // the ring's colour is its CSS color: --mut
  ink(); document.addEventListener('theme-change', () => requestAnimationFrame(ink)); matchMedia('(prefers-color-scheme: dark)').addEventListener('change', ink);
  const frame = (now) => {
    raf = 0;
    if (!live() || !seen || document.hidden) return idle();
    const ms = trace.offset(now), ph = ms < 0 ? ms + BEAT : ms;           // ms since the last beat
    // A canvas, not a resized element: resizing an element, or transforming an SVG one, lays the page
    // out again every frame (measured, about 1 ms), and a CSS scale would thin the stroke with it.
    const r = (3.25 + 6 * (1 - ph / BEAT)).toFixed(1), a = Math.min(1, ph / 150).toFixed(2), o = ph < 100 ? '1' : Math.max(0, 1 - (ph - 100) / 150).toFixed(2);
    if (r + a !== last.r) { last.r = r + a; g.clearRect(0, 0, 20, 20); g.globalAlpha = +a; g.beginPath(); g.arc(10, 10, +r, 0, 6.2832); g.stroke(); }
    if (o !== last.o) fill.style.opacity = last.o = o;
    raf = requestAnimationFrame(frame);
  };
  const idle = () => { item.classList.toggle('held', !calm.matches && !!trace && trace.paused()); fill.style.opacity = last.o = '0'; g.clearRect(0, 0, 20, 20); last.r = ''; };
  const go = () => { if (!raf && live() && seen && !document.hidden) raf = requestAnimationFrame(frame); else if (!live()) idle(); };
  new IntersectionObserver(([e]) => { seen = e.isIntersecting; go(); }).observe(item);
  document.addEventListener('visibilitychange', go);

  const sync = () => {
    tap.setAttribute('aria-disabled', String(!live()));
    item.classList.toggle('held', !calm.matches && !!trace && trace.paused());
    render(); go();
  };
  return {
    onTap,
    bind(t, pause) { trace = t; sync(); pause?.addEventListener('click', sync); },
    state: () => ({ streak, best, sound: ac?.state || 'none', line: line.textContent }),   // for the gate
  };
}
