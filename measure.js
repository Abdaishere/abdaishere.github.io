/* Measurement blocks: the number counts up once, on first view.
 *
 * The DOM already holds the final value before this file runs, so a crawler, a reader with
 * JavaScript off and a reader with reduced motion on all see the same page. Only textContent
 * animates, and only once. An IntersectionObserver at threshold 0.6 unobserves on its first hit.
 *
 * Nothing around the number is allowed to move while it counts: the box is pinned to the final
 * text's width for the duration. Intermediate strings are never longer than the final one, because
 * values >= 10 drop their decimals.
 *
 *   <b class="num" data-from="120" data-to="10" data-dec="0" data-prefix="~">~10</b>
 *
 *   import { counters } from './measure.js';
 *   counters();
 */

const calm = matchMedia('(prefers-reduced-motion: reduce)');
const finalText = (el) => (el.dataset.prefix || '') + Number(el.dataset.to).toFixed(+el.dataset.dec);

function run(el) {
  const from = +el.dataset.from, to = +el.dataset.to, dec = +el.dataset.dec, pre = el.dataset.prefix || '';
  const t0 = performance.now(), D = 900;
  el.style.display = 'inline-block';
  el.style.minWidth = el.getBoundingClientRect().width + 'px';
  const step = (now) => {
    // Same two-sided clamp as the trace: `now` is a rAF timestamp and `t0` a performance.now()
    // taken outside the callback, so the first frame can arrive with now < t0 and a negative p
    // would overshoot the count past its start value.
    const p = Math.max(0, Math.min(1, (now - t0) / D)), e = 1 - Math.pow(1 - p, 3);   // ease-out cubic
    const v = from + (to - from) * e;
    el.textContent = pre + v.toFixed(v >= 10 ? 0 : dec);
    if (p < 1) requestAnimationFrame(step);
    else { el.textContent = finalText(el); el.style.minWidth = ''; }
  };
  requestAnimationFrame(step);
}

export function counters(scope = document) {
  const els = [...scope.querySelectorAll('.num[data-to]')];
  els.forEach((el) => { el.textContent = finalText(el); });   // the markup is the source of truth; this only normalises it
  if (calm.matches || !els.length) return;
  const seen = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (e.isIntersecting) { run(e.target); seen.unobserve(e.target); }
  }), { threshold: 0.6 });
  els.forEach((el) => seen.observe(el));
}

/* The bar figures (2 h -> 10 min, to scale) fill on first view and stay filled. CSS holds them in
 * their final state without JS and under reduced motion, so this only adds the transition. */
export function reveal(selector = '.reveal') {
  const els = [...document.querySelectorAll(selector)];
  if (!els.length) return;
  if (calm.matches) { els.forEach((el) => el.classList.add('seen')); return; }
  const seen = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add('seen'); seen.unobserve(e.target); }
  }), { threshold: 0.35 });
  els.forEach((el) => seen.observe(el));
}
