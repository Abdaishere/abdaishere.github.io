/* Tap on the beat: the home hero's clock, made playable.
 *
 * The trace already fires on a 120 BPM clock. A tap on the hero is judged against that clock with
 * PolyBall's own PERFECT window (ball.gd PERFECT_BEAT_WINDOW, 0.06 s either side): on the beat, the
 * burst leaves amber and the streak grows; off it, the burst leaves red, stops dead at the switch,
 * and the streak is over. The line under the hero says by how much, and which way.
 *
 * Judged on pointerdown, so the burst leaves at once; counted on pointerup. A pointercancel means the
 * finger started a scroll, so that judgement is thrown away and the page scrolls as it always did.
 * Holding still pumps the plain stream (trace.js) and never counts.
 *
 * Sound is off until asked for. On, each tap on the beat plays the next chord of the game's loop
 * (Am F C G Am F C E7) in the game's chime voice (band.js, copied from sfx.gd); a miss is silence and
 * goes back to Am, as a miss ends a run in the game.
 *
 *   const t = taps({ tap, sound, line, status, chip });   // before start(): trace needs t.onTap
 *   const trace = start(canvas, { onTap: t.onTap, ... }); t.bind(trace, pauseButton);
 */
import { voicer, CHIME, CHORD_MIDI } from '/polyball/band.js';

const WINDOW = 60;   // ms either side of the beat: the game's PERFECT window
// ponytail: a fixed input-latency trim, 0 until measured on a real mid-range Android. If honest taps
// there land late by a steady amount, put the median here (ms) and every judgement shifts by it.
const TRIM = 0;

export function taps({ tap, sound, line, status, chip }) {
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  const hero = tap.closest('.hero');
  let trace = null, pending = null, streak = 0, best = 0, ac = null, voice = null, bus = null;

  const judge = (ms) => ({ ms: Math.round(ms - TRIM), hit: Math.abs(ms - TRIM) <= WINDOW });
  const live = () => trace && !calm.matches && trace.mode !== 'none' && !trace.paused();

  const say = (t) => { line.textContent = t; line.hidden = false; };
  /* The chip: the same news at the top of the switch line, where a tapper is already looking, since on
   * a laptop the line under the hero is below the fold. Beside the line, on whichever side has room.
   * Shown while a streak runs and for 3 s after a miss. Decorative: the line below is the record. */
  let chipOff = 0;
  function flag(count, text) {
    const W = hero.clientWidth, x = W < 720 ? W * 0.84 : W * 0.62;
    chip.replaceChildren(...(count ? [Object.assign(document.createElement('b'), { textContent: count }), text] : [text]));
    chip.classList.toggle('miss', !count);
    chip.hidden = false;
    const w = chip.offsetWidth, right = x + 8 + w <= W - 8;
    chip.style.left = right ? `${x + 8}px` : `${Math.max(8, x - 8 - w)}px`;
    requestAnimationFrame(() => chip.classList.add('on'));
    clearTimeout(chipOff);
    if (!count) chipOff = setTimeout(() => chip.classList.remove('on'), 3000);
  }
  function commit(j) {
    if (j.hit) {
      streak++; best = Math.max(best, streak);
      say(streak === 8 ? "8 on the beat. That's the whole progression." : `${streak} on the beat`);
      flag(String(streak), ' on the beat');
      if (sound.getAttribute('aria-pressed') === 'true' && ac) {
        const c = CHORD_MIDI[(streak - 1) % 8];
        for (let i = 0; i < 3; i++) voice(CHIME, c[i], ac.currentTime, -20);
      }
    } else {
      streak = 0;
      const t = `Missed by ${Math.abs(j.ms)} ms, ${j.ms > 0 ? 'late' : 'early'}.` + (best ? ` Best this visit: ${best}.` : '');
      say(t); status.textContent = t;
      flag('', `Missed by ${Math.abs(j.ms)} ms`);
    }
  }

  // called by trace.js on every press on the hero, with the signed distance from the beat in ms
  const onTap = (ms) => {
    pending = live() ? judge(ms) : null;
    if (!pending) return 0;
    return pending.hit ? 1 : 2;
  };

  hero.addEventListener('pointerup', () => { if (pending) commit(pending); pending = null; });
  hero.addEventListener('pointercancel', () => { pending = null; });

  // The keyboard's way in: a real button. Judged on keydown, since a button's own activation on Space
  // waits for keyup and would judge every keyboard tap late. Clicks are ignored: a pointer press on
  // the button is judged on pointerdown like any other press on the hero.
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

  const sync = () => tap.setAttribute('aria-disabled', String(!live()));
  return {
    onTap,
    bind(t, pause) { trace = t; sync(); pause?.addEventListener('click', sync); },
    state: () => ({ streak, best, sound: ac?.state || 'none' }),   // for the gate
  };
}
