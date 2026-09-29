/* The traffic figure on /e-jam/, part one: the diagram that is always there.
 *
 * Three layers share one coordinate system, and this file owns it:
 *   1. an <svg> of geometry only: lanes, the switch rings, the frozen packets (this file draws it)
 *   2. a layer of real DOM: text for every label, so the words never scale with the picture, and
 *      a <button> for every node, because the nodes are the figure's controls
 *   3. a <canvas> of moving packets (scene.js, three.js, lazy, importing LAYOUT from here)
 *
 * Layer 3 is the part that can be absent: no WebGL, reduced motion, a lost context, or simply
 * not scrolled to yet. Layers 1 and 2 are the figure's job. A reader who never loads three.js
 * still gets the labelled diagram, and under reduced motion gets it with the packets frozen
 * mid-flight, which is a real static frame rather than a blank box.
 *
 * Two layouts, because a four-stream diagram is unreadable at 390 px: four streams on a wide
 * screen, two on a narrow one. Both are authored in their own viewBox units; the box's CSS
 * aspect-ratio matches, so nothing distorts and a percentage in this file is a percentage on
 * screen. Labels are CSS pixels either way.
 */

export const LAYOUT = {
  wide: {
    w: 1600, h: 800,
    lo: 62, hi: 688, maxGap: 192, max: 6,   // row centres: 192 apart until they have to squeeze, never under the tally
    genX: 186, verX: 1414, boxW: 252, boxH: 116,
    sw: { x: 800, y: 400, r: [92, 130, 170] },
    gap: 182,            // lanes stop this far from the switch centre
    labelDrop: 206,      // "switch under test" sits this far below it
    laneAt: 0.44,        // where a stream's name rides its own lane
  },
  narrow: {
    w: 1000, h: 1000,
    lo: 180, hi: 820, maxGap: 640, max: 4,
    genX: 125, verX: 875, boxW: 210, boxH: 150,
    sw: { x: 500, y: 500, r: [86, 116, 150] },
    gap: 162,
    labelDrop: -200,  // above the switch here: the gap below it belongs to stream 2's name
    laneAt: 0.58,
  },
};

export const variant = () => (matchMedia('(min-width: 48rem)').matches ? 'wide' : 'narrow');

/* The heights of n nodes in a column: centred on the switch where they fit, slid inside lo..hi
 * where they do not, spaced at most maxGap apart. */
export const rows = (L, n) => {
  const gap = n > 1 ? Math.min(L.maxGap, (L.hi - L.lo) / (n - 1)) : 0;
  const y0 = Math.min(Math.max(L.sw.y - ((n - 1) / 2) * gap, L.lo), L.hi - (n - 1) * gap);
  return Array.from({ length: n }, (_, i) => y0 + i * gap);
};

/* Which verifier each generator's stream goes to. One stream per generator; with fewer verifiers
 * than generators some verifiers expect several streams, with more some sit idle. Monotonic, so
 * no two streams ever cross on the way out. */
export const route = (nGen, nVer) => Array.from({ length: nGen }, (_, s) => (nGen === 1 ? (nVer - 1) >> 1 : Math.round((s * (nVer - 1)) / (nGen - 1))));

/** Everything the three layers need about the current switchboard: node heights and one entry
 *  per stream with its verifier and its geometry. */
export function topology(L, state) {
  const nGen = state.gen.length, nVer = state.ver.length;
  const gy = rows(L, nGen), vy = rows(L, nVer), to = route(nGen, nVer);
  return { gy, vy, streams: gy.map((y, s) => ({ s, v: to[s], ...stream(L, y, vy[to[s]]) })) };
}

/* Where a stream's packets are born, where they are judged, and the two points where its lane
 * meets the switch. scene.js animates position -> switch centre -> end; the lane is drawn short
 * of the centre so the boxes and the rings never touch. */
export function stream(L, y, yOut = y) {
  const a = { x: L.genX + L.boxW / 2, y };
  const b = { x: L.verX - L.boxW / 2 - 14, y: yOut };   // stop just short of the box, not on its edge
  // Inside the switch a stream keeps a little of its own height, so four streams crossing at once
  // read as four streams being forwarded rather than as one bonfire in the middle.
  const c = { x: L.sw.x, y: L.sw.y + (y - L.sw.y) * 0.2 };
  // The lane is drawn along the path the packets actually fly, stopping short of the switch so
  // the rings stay clear. Aim it at c, not at the switch's centre, or the traffic leaves the wire.
  const toward = (p) => {
    const dx = p.x - c.x, dy = p.y - c.y, d = Math.hypot(dx, dy);
    return { x: c.x + (dx / d) * L.gap, y: c.y + (dy / d) * L.gap };
  };
  return { a, b, inb: toward(a), outb: toward(b), c };
}

const NS = 'http://www.w3.org/2000/svg';
const el = (t, attrs) => { const n = document.createElementNS(NS, t); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };
const hex = (cx, cy, r) => Array.from({ length: 6 }, (_, i) => {
  const a = (Math.PI / 3) * i - Math.PI / 6;
  return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
}).join(' ');

/* The same seeded generator scene.js uses, so the frozen packets sit where the moving ones would. */
export function prng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

/** A fresh switchboard: every generator and verifier on, four of each on a wide screen and two on
 *  a narrow one. The reader can add and remove nodes; the arrays' lengths are the counts. */
export const freshState = (key = variant()) => {
  const n = key === 'wide' ? 4 : 2;
  return { gen: Array(n).fill(true), ver: Array(n).fill(true) };
};

/** Fit a switchboard into a layout that holds fewer nodes: the last ones go, the rest keep their
 *  on/off. Used when a wide figure with six streams crosses into the narrow one. */
export const fit = (state, key) => {
  const m = LAYOUT[key].max;
  state.gen.length = Math.min(state.gen.length, m); state.ver.length = Math.min(state.ver.length, m);
  return state;
};

/** Draw the diagram into `svg` and `labels` for the given layout key.
 *  `frozen` additionally paints one still frame of traffic, for readers who asked for no motion. */
export function draw(svg, labels, key, state, { frozen = false } = {}) {
  const L = LAYOUT[key], T = topology(L, state);
  svg.setAttribute('viewBox', `0 0 ${L.w} ${L.h}`);
  svg.replaceChildren();
  labels.replaceChildren();

  const text = (s, x, y, cls) => {
    const n = document.createElement('span');
    n.className = 'dlabel' + (cls ? ' ' + cls : '');
    n.style.left = (x / L.w) * 100 + '%';
    n.style.top = (y / L.h) * 100 + '%';
    n.textContent = s;
    // Hidden one by one, not as a layer: the layer also holds the node buttons, and a control
    // inside an aria-hidden subtree takes focus while saying nothing to a screen reader.
    n.setAttribute('aria-hidden', 'true');
    labels.appendChild(n);
    return n;
  };

  /* Each stream owns a group: its two lane halves and, when frozen, its own packets. Inbound and
   * outbound are told apart inside it, because switching a verifier off changes only the far half
   * of that stream's picture. applyState works on these groups and touches nothing else. */
  const rnd = prng(20260928);
  T.streams.forEach((s, i) => {
    const g = el('g', { class: 'st', 'data-s': i, 'data-v': s.v });
    g.appendChild(el('path', { class: 'ln in', 'vector-effect': 'non-scaling-stroke', d: `M${s.a.x} ${s.a.y}L${s.inb.x.toFixed(1)} ${s.inb.y.toFixed(1)}` }));
    g.appendChild(el('path', { class: 'ln out', 'vector-effect': 'non-scaling-stroke', d: `M${s.outb.x.toFixed(1)} ${s.outb.y.toFixed(1)}L${s.b.x} ${s.b.y}` }));
    if (frozen) freezeStream(g, L, s, rnd);
    svg.appendChild(g);
  });

  // the switch: the outer ring is permanent (it carries the label), the inner two hand over to
  // the canvas once the model is live
  L.sw.r.forEach((r, k) => svg.appendChild(el('polygon', {
    class: 'ring' + (k === 0 ? ' on inner' : ''),   // the canvas takes over the innermost ring only
    'vector-effect': 'non-scaling-stroke', points: hex(L.sw.x, L.sw.y, r),
  })));

  /* The nodes are the figure's controls, so a node IS a button: one real element carrying the box,
   * the word, the focus ring and the pressed state, rather than an <svg> rect with a click handler
   * over it. Sized as a percentage of the box like every other label, so it keeps its place in the
   * drawing at every width. */
  const tight = Math.max(T.gy.length, T.vy.length) > (key === 'wide' ? 4 : 2);   // squeezed rows: smaller boxes
  const most = T.gy.length > T.vy.length ? T.gy : T.vy;
  const boxH = tight ? Math.min(L.boxH, (most[1] - most[0]) * 0.78) : L.boxH;
  for (const [ys, cx, what, kind] of [[T.gy, L.genX, 'Generator', 'gen'], [T.vy, L.verX, 'Verifier', 'ver']]) {
    ys.forEach((y, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'dlabel dnode';
      b.dataset.kind = kind;
      b.dataset.s = i;
      b.style.left = (cx / L.w) * 100 + '%';
      b.style.top = (y / L.h) * 100 + '%';
      b.style.width = (L.boxW / L.w) * 100 + '%';
      b.style.height = (boxH / L.h) * 100 + '%';
      b.setAttribute('aria-label', `${what} ${i + 1}`);
      b.textContent = what;
      labels.appendChild(b);
    });
  }
  // each stream's name rides its own lane, a little above it, near the generator that owns it
  const lift = Math.min(L.h * 0.058, boxH * 0.4);
  T.streams.forEach((s, i) => {
    const lx = s.a.x + (s.inb.x - s.a.x) * L.laneAt, ly = s.a.y + (s.inb.y - s.a.y) * L.laneAt;
    text(`Stream ${i + 1}`, lx, ly - lift, 'lane');
  });

  // labelDrop is signed. With the rows squeezed there is no gap left beside the switch, so the
  // label goes to the top edge, where the lanes have already turned in toward the centre.
  text('Switch under test', L.sw.x, tight ? L.h * 0.045 : L.sw.y + L.labelDrop, 'sw');
}

/** Reflect the switchboard onto a drawn diagram: the groups carry the picture, the buttons carry
 *  the pressed state. Safe on the still figure and on the live one, since the canvas only ever
 *  covers the packets, never the lanes or the nodes. */
export function applyState(svg, labels, key, state) {
  for (const g of svg.querySelectorAll('.st')) {
    g.classList.toggle('gen-off', !state.gen[+g.dataset.s]);
    g.classList.toggle('ver-off', !state.ver[+g.dataset.v]);
  }
  for (const b of labels.querySelectorAll('.dnode')) {
    b.setAttribute('aria-pressed', String(!!state[b.dataset.kind][+b.dataset.s]));
  }
}

/* One still frame for one stream: packets scattered along its lane, plus the one caught in the act
 * of not coming out of the switch. Deterministic and drawn in stream order off a shared generator,
 * so the picture is the same on every load. */
function freezeStream(g, L, s, rnd) {
  for (let k = 0; k < 13; k++) {
    const t = (k + rnd() * 0.8) / 13;
    const p = t < 0.5
      ? lerp(s.a, s.c, t * 2)
      : lerp(s.c, s.b, (t - 0.5) * 2);
    const near = Math.exp(-40 * (t - 0.5) * (t - 0.5));
    const off = (rnd() - 0.5) * L.h * 0.05;
    g.appendChild(el('circle', {
      class: `pk ${t < 0.5 ? 'in' : 'out'}${near > 0.7 ? ' hot' : ''}`,
      cx: p.x.toFixed(1), cy: (p.y + off).toFixed(1),
      r: (L.h * (0.006 + rnd() * 0.0045)).toFixed(1),
      opacity: (0.5 + 0.5 * near).toFixed(2),
    }));
  }
  // the frame this switch dropped: still at the crossing, already half gone
  const d = lerp(s.a, s.c, 0.97);
  g.appendChild(el('circle', { class: 'pk in lost', cx: d.x.toFixed(1), cy: (d.y + L.h * 0.02).toFixed(1), r: (L.h * 0.008).toFixed(1) }));
}

const lerp = (p, q, t) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
