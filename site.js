/* Shell behaviour shared by every page: theme toggle, the phone Menu, the Dubai clock, the copy
 * button, and the nav's reading marker. Everything here is optional. A page that has none of these
 * elements loads this file and nothing happens.
 *
 * Deliberately not a framework and deliberately not inline: four pages were repeating the same
 * sixty lines, and the copy that drifted was always the one nobody was looking at. */

const root = document.documentElement;

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
  if (!root.dataset.theme) return;
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
