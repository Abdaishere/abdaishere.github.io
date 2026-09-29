/* "You are the band", playable: a small copy of the game's note engine, in Web Audio.
 *
 * Taken from scripts/autoload/sfx.gd, not invented for the page:
 *   - the chord table (CHORD_MIDI) and its 8-bar loop Am F C G Am F C E7, one bar per chord
 *   - the tempo, 100 BPM (BEAT = 0.6 s), and the swing on the off 8ths (0.07 of a beat)
 *   - colour i plays the i-th tone of the chord under it: root, 3rd, 5th, 7th, 9th
 *   - the layer gates: bass joins at a streak of 2, the arpeggio at 5, the lead at 8
 *   - the lead's call and answer motifs, the bass line's roots, and the "chime" voice's partials
 * Simplified: the game's bass walks root, fifth and a chromatic approach; this one plays root and
 * fifth. There is no ball, so nothing can be missed; two beats of silence stand in for a miss.
 *
 * Nothing loads or sounds until the first press, which is also what browsers require.
 */
const BEAT = 0.6, BAR = BEAT * 4, SWING = 0.07 * BEAT;
const CHORDS = ['Am', 'F', 'C', 'G', 'Am', 'F', 'C', 'E7'];
const CHORD_MIDI = [
  [69, 72, 76, 67, 71], [65, 69, 72, 76, 67], [60, 64, 67, 71, 74], [67, 71, 74, 76, 69],
  [69, 72, 76, 67, 71], [65, 69, 72, 76, 67], [60, 64, 67, 71, 74], [64, 68, 71, 74, 66],
];
const BASS_MIDI = [45, 41, 48, 43, 45, 41, 48, 40];
const LEAD_CALL = [0, 2, 1, -1, 3, 2, -1, 4], LEAD_ANSWER = [4, 2, 3, -1, 1, -1, 0, -1];
const GATES = { bass: 2, arp: 5, lead: 8 };
// [wave, frequency multiple, detune cents, amp, decay multiplier], as in sfx.gd
const CHIME = { parts: [['sine', 1, 0, 1], ['sine', 2, 0, 0.28], ['sine', 4, 0, 0.08]], attack: 0.012, tau: 0.32, amp: 0.36 };
const BASS = { parts: [['triangle', 1, 0, 1], ['sine', 0.5, 0, 0.4]], attack: 0.012, tau: 0.16, amp: 0.5 };
const ARP = { ...CHIME, tau: 0.18, amp: 0.3, attack: 0.01 };
const LEAD = { ...CHIME, amp: 0.32 };
const DB = { note: -8, bass: -7, arp: -10, lead: -7 };

const hz = (m) => 440 * 2 ** ((m - 69) / 12);
const lin = (db) => 10 ** (db / 20);

export function band(root) {
  const keys = [...root.querySelectorAll('.band-key')];
  const out = { streak: root.querySelector('#band-streak'), chord: root.querySelector('#band-chord') };
  const layerEls = Object.fromEntries([...root.querySelectorAll('[data-layer]')].map((e) => [e.dataset.layer, e]));
  let ac = null, bus = null, meter = null, t0 = 0, streak = 0, lastHit = -1e9, timer = 0, next8 = 0, arpStep = 0;

  function voice(recipe, midi, when, db) {
    const g = ac.createGain(), end = when + Math.min(recipe.tau * 5 + recipe.attack, 2.2);
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(recipe.amp * lin(db), when + recipe.attack);
    g.gain.setTargetAtTime(0, when + recipe.attack, recipe.tau);
    g.connect(bus);
    for (const [wave, mul, cents, amp] of recipe.parts) {
      const o = ac.createOscillator(), a = ac.createGain();
      o.type = wave === 'saw' ? 'sawtooth' : wave;
      o.frequency.value = hz(midi) * mul; o.detune.value = cents + (Math.random() * 20 - 10);   // the game's ±10 cent humanise
      a.gain.value = amp;
      o.connect(a).connect(g); o.start(when); o.stop(end);
    }
    setTimeout(() => g.disconnect(), (end - ac.currentTime) * 1000 + 100);
  }

  const chordAt = (t) => Math.floor(Math.max(0, t - t0) / BAR) % 8;
  const on = (layer) => streak >= GATES[layer];

  // Look-ahead scheduler: every 25 ms, book whatever 8ths fall in the next 120 ms.
  function tick() {
    const now = ac.currentTime;
    if (streak && now - lastHit > 2 * BEAT) setStreak(0);      // two silent beats: the band stops
    while (next8 < now + 0.12) {
      const n = Math.round((next8 - t0) / (BEAT / 2)), beat = Math.floor(n / 2) % 4, bar = Math.floor(n / 8);
      const c = bar % 8, when = next8 + (n % 2 ? SWING : 0);
      if (on('bass') && n % 2 === 0 && (beat === 0 || beat === 2)) voice(BASS, BASS_MIDI[c] + (beat === 2 ? 7 : 0) + 12, when, DB.bass);
      if (on('arp')) voice(ARP, CHORD_MIDI[c][arpStep++ % 5], when, DB.arp);
      if (on('lead') && n % 2 === 0 && (beat === 0 || beat === 2)) {
        const deg = (c < 4 ? LEAD_CALL : LEAD_ANSWER)[(c % 4) * 2 + (beat === 2 ? 1 : 0)];
        if (deg >= 0) voice(LEAD, CHORD_MIDI[c][deg] + 12, when, DB.lead);
      }
      next8 += BEAT / 2;
    }
    out.chord.textContent = CHORDS[chordAt(now)];
    if (!streak && now - lastHit > 2.5) { clearInterval(timer); timer = 0; }   // idle: stop waking up
  }

  function setStreak(n) {
    streak = n;
    out.streak.textContent = n;
    for (const [k, el] of Object.entries(layerEls)) el.classList.toggle('in', n >= GATES[k]);
    root.classList.toggle('playing', n > 0);
  }

  function hit(i) {
    if (!ac) {
      ac = new AudioContext();
      const comp = ac.createDynamicsCompressor();
      bus = ac.createGain(); bus.gain.value = 0.8;
      meter = ac.createAnalyser(); meter.fftSize = 1024;
      bus.connect(comp).connect(meter).connect(ac.destination);
    }
    if (ac.state === 'suspended') ac.resume();
    const now = ac.currentTime;
    if (!timer) {
      if (now - lastHit > 2 * BEAT) { t0 = now; next8 = now + BEAT / 2; arpStep = 0; }   // a fresh song starts on Am
      timer = setInterval(tick, 25);
    }
    // off-beats land softer, as in the game
    const phase = ((now - t0) % BEAT) / BEAT, strong = phase < 0.15 || phase > 0.85;
    voice(CHIME, CHORD_MIDI[chordAt(now)][i], now, DB.note + (strong ? 0 : -2));
    lastHit = now;
    setStreak(streak + 1);
    out.chord.textContent = CHORDS[chordAt(now)];
    const k = keys[i];
    k.classList.remove('hit'); void k.offsetWidth; k.classList.add('hit');
  }

  root.addEventListener('click', (e) => { const k = e.target.closest('.band-key'); if (k) hit(+k.dataset.i); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && ac) { setStreak(0); ac.suspend(); } });

  const api = {
    streak: () => streak,
    layers: () => Object.keys(GATES).filter(on),
    rms: () => { if (!meter) return 0; const d = new Float32Array(meter.fftSize); meter.getFloatTimeDomainData(d); return Math.sqrt(d.reduce((a, v) => a + v * v, 0) / d.length); },
    state: () => ac?.state || 'none',
  };
  return api;
}
