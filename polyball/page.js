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

function embed() {
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
}
