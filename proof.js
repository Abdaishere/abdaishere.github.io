/* The proof item in the status bar: this month's best Classic run and how many players are on that
 * board, read live from the game's leaderboard (the same read, the same cache, as /polyball/'s top
 * three: board.js).
 *
 * It only ever shows a number it has just read. A refused, throttled, timed-out or malformed read
 * leaves it hidden, and so does an empty board (the morning of the 1st, after the monthly reset):
 * no zero and no remembered number is ever shown as fact.
 *
 * Wide screens only. Below 68.75rem the status bar wraps, so an item arriving after the fetch
 * would add a line and push the hero down; phones get the live board itself on /polyball/. Home's
 * bar also carries the beat item, so there it waits for 85rem (data-min, matched in site.css).
 *
 *   <a class="proof" id="proof" href="/polyball/#leaderboard" data-platform data-min="85rem" hidden></a>
 */
const el = document.getElementById('proof');
const wide = matchMedia(`(min-width: ${el?.dataset.min || '68.75rem'})`);

async function read() {
  if (!window.PB) await import('/polyball/board.js');   // a classic script: it puts PB on window
  // The board view caps at the month's top 100, so a full page means at least that many.
  const rows = await window.PB.fetchBoard(0, 5);
  if (!rows.length) return;
  const top = rows[0], n = rows.length;
  const b = (t) => { const x = document.createElement('b'); x.textContent = t; return x; };
  const parts = [el.dataset.lead || 'This month: best ', b(new Intl.NumberFormat('en-GB').format(top.score))];
  const plat = { Android: 'Android', iOS: 'iPhone', Web: 'the web', Windows: 'Windows', macOS: 'Mac', Linux: 'Linux' }[top.platform];
  if (el.hasAttribute('data-platform') && plat) parts.push(', on ' + plat);
  parts.push(' · ', b(n >= 100 ? '100+' : String(n)), n === 1 ? ' player' : ' players');
  el.replaceChildren(...parts);
  el.hidden = false;
}

if (el && wide.matches) {
  const go = () => read().catch(() => { el.hidden = true; });
  document.readyState === 'complete' ? go() : addEventListener('load', go, { once: true });
}
