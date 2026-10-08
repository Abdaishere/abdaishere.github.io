/* Shell behaviour shared by every page: theme toggle, the phone Menu, the Dubai clock, the status
 * bar's beat item, the copy button, and the nav's reading marker. Everything here is optional. A page that has none of these
 * elements loads this file and nothing happens.
 *
 * Deliberately not a framework and deliberately not inline: four pages were repeating the same
 * sixty lines, and the copy that drifted was always the one nobody was looking at. */

import { taps } from '/tap.js';

const root = document.documentElement;

/* ---- the beat item in the status bar. A page with a trace wires it to the trace itself (home,
       /e-jam/); every other page gives it its own clock here. ---- */
if (document.getElementById('beatitem') && !document.getElementById('trace')) {
  // QA ST-02: /polyball/'s own game runs at 100 BPM (band.js), not the
  // widget's generic 120 BPM pace other no-trace pages show.
  const onPolyball = location.pathname.startsWith('/polyball/');
  const t = taps(onPolyball ? { restLabel: 'Tap' } : {}); t.bind();
  if (['localhost', '127.0.0.1'].includes(location.hostname)) window.__taps = t; // gate hook
}

/* ---- theme: data-theme wins over the system preference, and the choice survives a reload ---- */
const themeBtn = document.getElementById('theme');
if (themeBtn) {
  themeBtn.addEventListener('click', () => {
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('theme-v3', root.dataset.theme); } catch (e) {}
    paintBar();
    document.dispatchEvent(new CustomEvent('theme-change'));
  });
}
/* The browser chrome follows the page. Only meaningful once a manual choice overrides the system
 * preference; the media-query variants in the markup handle the rest. */
function paintBar() {
  if (!root.dataset.theme || !themeBtn) return;   // no toggle on the page (the leaderboard is dark only)
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => { m.content = root.dataset.theme === 'dark' ? '#0A0B0F' : '#FAFAF7'; });
}
paintBar();

/* ---- phone menu: closed by the button, a link, Escape or widening. Not by outside taps, which
       on a touch screen are indistinguishable from a scroll that started on the page. ---- */
const menu = document.getElementById('menu');
if (menu) {
  const narrow = matchMedia('(max-width: 53.75rem)');
  const setMenu = (open) => { menu.setAttribute('aria-expanded', String(open)); menu.textContent = open ? 'Close' : 'Menu'; root.classList.toggle('menu-open', open); };
  menu.addEventListener('click', () => setMenu(menu.getAttribute('aria-expanded') !== 'true'));
  document.querySelectorAll('.nav a').forEach((a) => a.addEventListener('click', () => setMenu(false)));
  narrow.addEventListener('change', () => setMenu(false));
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && root.classList.contains('menu-open')) { setMenu(false); if (narrow.matches) menu.focus(); } });
}

/* ---- Dubai clock, so a reader in another timezone knows whether a reply is likely today ---- */
const clocks = [...document.querySelectorAll('.clock')];
if (clocks.length) {
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit' });
  const tick = () => {
    const t = fmt.format(new Date());
    clocks.forEach((el) => { el.textContent = t; });
  };
  tick(); setInterval(tick, 30000);
}

/* ---- copy the address: a mailto: click gives a webmail user nothing ---- */
const copy = document.getElementById('copy');
if (copy) {
  let reset = 0;
  copy.addEventListener('click', async () => {
    const label = copy.querySelector('.copy-label'), status = document.getElementById('copy-status');
    clearTimeout(reset);
    try {
      await navigator.clipboard.writeText(copy.dataset.email);
      label.textContent = 'Copied'; if (status) status.textContent = 'Email address copied';
    } catch (e) {
      label.textContent = 'Select it instead'; if (status) status.textContent = 'Copy failed. Select the address above instead.';
    }
    reset = setTimeout(() => { label.textContent = 'Copy address'; if (status) status.textContent = ''; }, 2400);
  });
}

/* ---- the footer's weight line: what this browser actually fetched from this site, compressed.
       Measured, not written down, so it cannot go stale on the next deploy. Same-origin entries only:
       a cross-origin file (the leaderboard read, YouTube) reports 0 bytes without a Timing-Allow-Origin
       header, hence "from this site". encodedBodySize is still reported for a cache hit, so a repeat
       visit reads the same. It grows when a lazy file arrives (three.js, the loop), which is the point
       of "so far". Updated at most once a second, never announced. ---- */
const weight = document.getElementById('weight');
if (weight && window.PerformanceObserver) {
  const files = new Map();
  let queued = 0;
  const show = () => {
    queued = 0;
    let bytes = 0; files.forEach((b) => { bytes += b; });
    if (!bytes) return;
    weight.textContent = ` So far this page has loaded ${Math.round(bytes / 1000).toLocaleString('en-GB')} KB from this site, in ${files.size} ${files.size === 1 ? 'file' : 'files'}.`;
  };
  const take = (list) => {
    for (const e of list) {
      if (!e.name.startsWith(location.origin) || !e.encodedBodySize) continue;
      files.set(e.name, e.encodedBodySize);
    }
    if (!queued) queued = setTimeout(show, 1000);
  };
  take(performance.getEntriesByType('navigation'));
  new PerformanceObserver((l) => take(l.getEntries())).observe({ type: 'resource', buffered: true });
}

/* ---- the nav marks the section being read. Contact wins whenever it is half in view; on a tall
       screen the closing block never reaches the middle band, so it needs its own observer. ---- */
const links = new Map([...document.querySelectorAll('.nav a[href^="#"]')].map((a) => [a.hash.slice(1), a]));
if (links.size) {
  const mark = (id) => links.forEach((l, key) => (key === id ? l.setAttribute('aria-current', 'true') : l.removeAttribute('aria-current')));
  let band = null, atEnd = false;
  const spy = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { band = e.target.id; if (!atEnd) mark(band); } }), { rootMargin: '-45% 0px -50% 0px' });
  links.forEach((_, id) => { const el = document.getElementById(id); if (el && id !== 'contact') spy.observe(el); });
  const end = document.getElementById('contact');
  if (end && links.has('contact')) new IntersectionObserver(([e]) => { atEnd = e.isIntersecting; mark(atEnd ? 'contact' : band); }, { threshold: 0.5 }).observe(end);
}
