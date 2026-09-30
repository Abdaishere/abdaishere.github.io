/* The PolyBall page: the play stage, the trailer, and the live cup top three.
 * board.js (classic script) has already put PB on window by the time this module runs. */
import { counters } from '/measure.js';
import { band } from './band.js';

counters();

/* ---- the band: the game's chords and layer gates, playable in the page ---- */
const bandEl = document.getElementById('band');
if (bandEl && window.AudioContext) {
  const b = band(bandEl);
  if (['localhost', '127.0.0.1'].includes(location.hostname)) window.__band = b; // gate hook
} else if (bandEl) bandEl.style.display = 'none';   // no Web Audio, no instrument

/* Old board deep links (#mode=1&sides=7) belong to the leaderboard page. */
if (/mode=\d/.test(location.hash)) location.replace('leaderboard/' + location.hash);

/* ---- the play stage ----
 * Desktop swaps the poster for the game in place, so a visitor can try it without losing the page.
 * A touch device navigates to /polyball/play/ instead: the shell sets touch-action: none, and a
 * 39 MB wasm canvas inside a scrolling page is a fight between the game and the scroll.
 * Either way the button is a real link to the game, so it works with no JavaScript at all.
 */
const stage = document.getElementById('stage');
const play = document.getElementById('play');
const coarse = matchMedia('(pointer: coarse)').matches;

/* ---- the loop: four silent seconds of a real run over the poster, which is its first frame ----
 * Nothing is fetched until the stage is near the screen, and nothing at all under reduced motion,
 * Save-Data or a 2G connection: those keep the still. It plays muted and inline, so every browser
 * lets it start on its own; it is decorative (the poster's alt says what it shows), so the video is
 * hidden from assistive tech and takes no taps. A loop that keeps going runs past five seconds, so
 * it gets a Pause (WCAG 2.2.2), and it stops by itself off screen. */
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const net = navigator.connection;
const lean = net?.saveData || /(^|-)2g$/.test(net?.effectiveType || '');
if (stage && !calm && !lean && 'IntersectionObserver' in window) {
  let v = null, held = false;
  const near = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) { v?.pause(); return; }
    if (v) { if (!held && v.isConnected) v.play().catch(() => {}); return; }
    v = document.createElement('video');
    v.muted = true; v.loop = true; v.playsInline = true; v.autoplay = true;
    v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('aria-hidden', 'true');
    v.poster = stage.querySelector('img').src;
    for (const [src, type] of [['loop.webm', 'video/webm'], ['loop.mp4', 'video/mp4']]) {
      const s = document.createElement('source'); s.src = src; s.type = type; v.appendChild(s);
    }
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'btn-plain pause';
    btn.innerHTML = '<span class="p-on">Pause</span><span class="p-off">Play</span><span class="sr"> the gameplay loop</span>';
    btn.addEventListener('click', () => {
      held = btn.dataset.paused !== 'true';
      btn.dataset.paused = String(held);
      held ? v.pause() : v.play().catch(() => {});
    });
    // Only once it is really playing: a video that never starts leaves the poster and no stray button.
    v.addEventListener('playing', () => {
      if (!btn.isConnected && v.isConnected) { document.querySelector('.stage-row').appendChild(btn); document.querySelector('.loop-note').hidden = false; }
    }, { once: true });
    stage.appendChild(v);
  }, { rootMargin: '300px 0px' });
  near.observe(stage);
  if (['localhost', '127.0.0.1'].includes(location.hostname)) window.__loop = () => v; // gate hook
}

function embed() {
  document.querySelector('.loop-note')?.setAttribute('hidden', '');
  document.querySelector('.stage-row .pause')?.remove();
  const f = document.createElement('iframe');
  f.src = '/polyball/play/';
  f.title = 'PolyBall, playable';
  f.allow = 'autoplay; fullscreen; gamepad';
  stage.replaceChildren(f);
  f.focus();
}

if (play && stage && !coarse) {
  play.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;   // let a new-tab click be a new tab
    e.preventDefault();
    embed();
  });
  // ?play is the deep link for end cards and QR codes: skip the poster step entirely.
  if (new URLSearchParams(location.search).has('play')) embed();
} else if (coarse && new URLSearchParams(location.search).has('play')) {
  location.replace('/polyball/play/');
}

/* ---- trailer: nothing is requested from YouTube until someone asks for it ---- */
const trailerBtn = document.getElementById('trailerBtn');
if (trailerBtn) trailerBtn.addEventListener('click', function () {
  const f = document.createElement('iframe');
  f.src = 'https://www.youtube-nocookie.com/embed/0A4oTiEH7Co?autoplay=1';
  f.allow = 'autoplay; fullscreen';
  f.title = 'PolyBall trailer';
  f.style.cssText = 'width:100%;aspect-ratio:16/9;border:1px solid var(--line);display:block';
  this.replaceWith(f);
});

/* ---- the cup teaser: live top three, Classic on five sides ---- */
const ol = document.getElementById('cupTop');
if (ol && window.PB) {
  const note = (t) => { const li = document.createElement('li'); li.className = 'cap'; li.textContent = t; ol.appendChild(li); };
  PB.fetchBoard(0, 5)
    .then((rows) => {
      ol.textContent = '';
      if (!rows.length) note('Nobody has posted a run here yet. It could be you.');
      rows.slice(0, 3).forEach((r, i) => ol.appendChild(PB.card(r, i + 1)));
    })
    .catch(() => { ol.textContent = ''; note('The leaderboard is taking a break. Try again in a moment.'); })
    .then(() => ol.removeAttribute('aria-busy'));

  /* Name the cup, but only while it really is this board (the cup board is a server setting), and
     the latest confirmed champion once there is one ("Last champion", not "last cup": the newest cup
     may still be waiting for the check). Any failure keeps the static lede. */
  PB.fetchCups().then((cups) => {
    const live = PB.cupOf(cups, 'live'), last = cups.champs[0];
    if (live && live.mode === 'Classic' && live.sides === 5) {
      document.getElementById('cupLede').replaceChildren('The ' + live.name + ': the best Classic runs on 5' + PB.NB + 'sides, live from the game. It closes ', PB.closeTime(live.season), '.');
    }
    if (last) {
      const p = document.getElementById('cupLast'), a = document.createElement('a');
      a.href = 'leaderboard/#champions'; a.textContent = last.name;
      p.replaceChildren('Last champion: ', a, ', ' + PB.monthOf(last.season) + ', with' + PB.NB + new Intl.NumberFormat().format(last.score) + '.');
      p.hidden = false;
    }
  }).catch(() => { /* either read failed: the static lede, and no last-cup line, are the fallback */ });
}
