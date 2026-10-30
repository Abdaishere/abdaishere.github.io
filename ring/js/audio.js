/* The Ring's sound. Loaded on the first press of Sound and never before; no audio file is fetched,
 * every tone is synthesised here.
 *
 * The voices are the game's (web/polyball/band.js, copied from PolyBall's sfx.gd): the chime's three
 * partials, the bass's triangle and sub. The key is the game's, A minor, and every note is from its
 * pentatonic (sfx.gd FIXED_MIDI, C D E G A), the starter kit's rule that no two of them clash.
 *
 * Each side has one tone, and they make a line round the ring: up the A minor chord to the ask on
 * side 4, the root an octave up, then down the pentatonic, so Hello's A comes round again an octave
 * below. Tones sit on the page's 120 BPM grid: a line-up tone waits for the next sixteenth (at most
 * 125 ms), so the sound and the beat dot share one clock. The climax is a cadence: the ball's catches
 * ring the visited tones over a dominant pedal (E in the bass), and the last catch, on the contact side,
 * lands the root with the bass moving to A. Those two bass notes are the resolution. The climax is the
 * loudest moment on the page, by design; the ticks are the quietest.
 */
const SIDE = [69, 72, 76, 81, 79, 76];                       // A4 C5 E5 A5 G5 E5
const LADDER = [69, 72, 74, 76, 79, 81, 84, 86, 88, 91];     // A minor pentatonic, two octaves
const CHIME = { parts: [['sine', 1, 1], ['sine', 2, 0.28], ['sine', 4, 0.08]], attack: 0.012, tau: 0.32, amp: 0.36 };
const BELL = { ...CHIME, tau: 1.1 };
const PLUCK = { ...CHIME, attack: 0.004, tau: 0.09, amp: 0.3 };
const BASS = { parts: [['triangle', 1, 1], ['sine', 0.5, 0.5]], attack: 0.015, tau: 0.6, amp: 0.5 };
const TICK = { parts: [['triangle', 1, 1]], attack: 0.002, tau: 0.014, amp: 0.4 };
const hz = (m) => 440 * 2 ** ((m - 69) / 12);

const Ctx = window.AudioContext || window.webkitAudioContext;
const ac = Ctx ? new Ctx() : null;
let bus = null;
if (ac) {
  bus = ac.createGain(); bus.gain.value = 0.7;
  bus.connect(ac.createDynamicsCompressor()).connect(ac.destination);
}
let t0 = performance.now();
/** the page's clock: the beat grid starts at t0 (performance.now), 120 BPM */
export const sync = (at) => { t0 = at; };
// a page-clock moment (performance.now ms) on the audio clock, read at the same instant so a late
// frame adds no jitter; and the next grid division `div` ms wide (the division itself if within 10 ms)
const onClock = (ms) => ac.currentTime + (ms - performance.now()) / 1000;
const next = (div) => { const now = performance.now(), ph = (now - t0) % div; return onClock(now + (ph < 10 ? 0 : div - ph)); };

function voice(r, midi, db, when = ac.currentTime, tau = r.tau) {
  // never on the audio clock's past: a voice whose automation starts behind the clock can lose it
  // and play at full gain (seen as a 40 dB pop when the main thread stalled on the plate)
  when = Math.max(when, ac.currentTime + 0.008);
  const g = ac.createGain(), end = when + Math.min(tau * 5 + r.attack, 4);
  g.gain.value = 0;   // and silent is the fallback if the clock has passed the booking anyway
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(r.amp * 10 ** (db / 20), when + r.attack);
  g.gain.setTargetAtTime(0, when + r.attack, tau);
  g.connect(bus);
  const cents = Math.random() * 12 - 6;   // the game's humanise, on the whole note so its partials stay in tune
  for (const [wave, mul, amp] of r.parts) {
    const o = ac.createOscillator(), a = ac.createGain();
    o.type = wave; o.frequency.value = hz(midi) * mul; o.detune.value = cents;
    a.gain.value = amp; o.connect(a).connect(g); o.start(when); o.stop(end);
  }
  setTimeout(() => g.disconnect(), (end - ac.currentTime) * 1000 + 100);
}
const ok = () => ac && ac.state !== 'closed';

export const resume = () => { if (ac && ac.state !== 'running' && !document.hidden) ac.resume(); };
export const suspend = () => { if (ac && ac.state === 'running') ac.suspend(); };
/** the tone of side k as it lines up, on the next sixteenth */
export const side = (k) => { if (ok()) voice(CHIME, SIDE[k], -8, next(125)); };
/** side 4's climax: side k's tone as the ball lands on it at page time `ms`, booked on the audio
 *  clock a drop ahead so the catch lands on the beat whatever the frame rate. The first catch brings
 *  the dominant pedal, the last (the contact side) the root in the bass: the chord resolves. */
export const bell = (k, ms, role) => {
  if (!ok()) return;
  const at = onClock(ms);
  voice(BELL, SIDE[k], role === 'last' ? -3 : -5, at);
  if (role === 'first') voice(BASS, 40, -9, at, 0.5);          // E2, held under the catches
  if (role === 'last') { voice(BASS, 45, -3, at, 1.0); voice(BELL, 57, -9, at); }   // A2 and A3: home
};
/** an on-beat tap on side 3: the n-th step up the pentatonic, at once (the game plays on the tap) */
export const hit = (n) => { if (ok()) voice(CHIME, LADDER[Math.min(n, LADDER.length - 1)], -8); };
/** the beat, heard while side 3 asks for a tap, and side 2's packets: one soft tick, booked for the
 *  next beat on the grid (the frame that notices a beat is already a frame late) */
export const tick = () => { if (ok()) voice(TICK, 93, -22, next(500)); };
/** side 5's layers as they are laid, `k` of the way up: a pluck up the pentatonic on the sixteenths */
let lastLayer = -1;
export const layer = (k) => {
  if (!ok()) return;
  const at = next(125), slot = Math.round(at * 8);
  if (slot === lastLayer) return;
  lastLayer = slot;
  voice(PLUCK, LADDER[Math.min(LADDER.length - 1, Math.floor(k * LADDER.length))], -16, at);
};
