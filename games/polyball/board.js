/* PolyBall leaderboard: live reads + the player card renderer.
   Reads the live Supabase `board` view (cup migration: this month's top 100
   with admin plate overrides applied and shadow-banned rows gone) with the
   public (publishable) key, read-only select, the same query the game sends.
   Every cosmetic field is an id checked against a whitelist, then mapped to a
   class. Nothing from the wire is ever used as CSS or HTML. */
(function () {
  'use strict';

  var URL_BASE = 'https://osnwwrpkyvcflfcixwmw.supabase.co/rest/v1/board';
  var KEY = 'sb_publishable_LvCJhoJY47Q-FIpaiBswfQ_2qzyx7tW';
  var MODES = ['Classic', 'Music', 'Time'];

  var FLAIR = { none:1, slate:1, neon:1, holo:1, circuit:1, frost:1, gilded:1, ember:1, 'void':1, bloom:1, carbon:1 };
  /* game font id -> card font class. ponytail: Fredoka / Baloo are not self-hosted
     here, so those plates fall back to Nunito; add the woff2s if players ask. */
  var FONT = { font_nunito:'nunito', font_heavy:'heavy', font_wide:'wide', font_slant:'slant', font_fredoka:'nunito', font_baloo:'nunito', font_sans:'nunito' };
  /* the only three title ids whose English string is not the id title-cased */
  var TITLE_OVERRIDE = { title_daily: 'Daily Devotee', title_shapes: 'Shapeshifter', title_nightowl: 'Night Owl' };
  /* platform tag -> icon. Keys are the DB check constraint's values; 'unknown' (every row from a
     client that predates the tag, which is every row today) draws nothing. Web, Windows, Mac and
     Linux are the landing page's download-card glyphs, so the board and "Get it" agree; Android
     and iOS have no card of their own. Every glyph was picked by reading it at 20 px, which is
     the size a phone gets, where the label is hidden. */
  var PLAT = {
    Android: { label: 'Android', stroke: 0, d: 'M6.2 9.4h11.6v7.2a1.2 1.2 0 0 1-1.2 1.2h-1v2.9a1.3 1.3 0 0 1-2.6 0v-2.9h-2v2.9a1.3 1.3 0 0 1-2.6 0v-2.9h-1a1.2 1.2 0 0 1-1.2-1.2V9.4Zm-3 0a1.3 1.3 0 0 1 1.3 1.3v4.2a1.3 1.3 0 0 1-2.6 0v-4.2A1.3 1.3 0 0 1 3.2 9.4Zm17.6 0a1.3 1.3 0 0 1 1.3 1.3v4.2a1.3 1.3 0 0 1-2.6 0v-4.2a1.3 1.3 0 0 1 1.3-1.3ZM6.3 8.4c.2-1.9 1.3-3.5 3-4.5l-1.1-1.6a.4.4 0 0 1 .7-.5l1.2 1.7a6.9 6.9 0 0 1 3.8 0l1.2-1.7a.4.4 0 0 1 .7.5l-1.1 1.6c1.7 1 2.8 2.6 3 4.5H6.3Zm3.1-2.6a.7.7 0 1 0 0 1.4.7.7 0 0 0 0-1.4Zm5.2 0a.7.7 0 1 0 0 1.4.7.7 0 0 0 0-1.4Z' },
    Web:     { label: 'Web browser', stroke: 1, d: 'M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0ZM3 12h18M12 3c2.5 2.6 2.5 15.4 0 18M12 3c-2.5 2.6-2.5 15.4 0 18' },
    Windows: { label: 'Windows', stroke: 0, d: 'M3 5.5 10.5 4.4v7.1H3V5.5Zm8.6-1.3L21 3v8.5h-9.4V4.2ZM3 12.5h7.5v7.1L3 18.5v-6Zm8.6 0H21V21l-9.4-1.3v-7.2Z' },
    macOS:   { label: 'Mac', stroke: 0, d: 'M16.2 12.7c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.8-.9-3-.8-1.5 0-2.9.9-3.7 2.3-1.6 2.7-.4 6.8 1.1 9 .8 1.1 1.7 2.3 2.9 2.3 1.2 0 1.6-.7 3-.7 1.4 0 1.8.7 3 .7 1.3 0 2.1-1.1 2.8-2.2.9-1.3 1.3-2.5 1.3-2.6-.1 0-2.5-1-2.5-3.6ZM14 5.9c.6-.8 1-1.9.9-3-.9 0-2 .6-2.7 1.4-.6.7-1.1 1.8-.9 2.9 1 .1 2-.5 2.7-1.3Z' },
    Linux:   { label: 'Linux', stroke: 0, d: 'M12 2.2c-2.1 0-3.5 1.6-3.5 3.8v2.2c0 1-.5 1.8-1.2 2.7-1.2 1.6-2.3 3.2-2.3 5.3 0 1.1.4 2 1 2.7l-.7 1.4c-.3.6 0 1.2.6 1.3l2.2.4c.4.5 1 .8 1.7.8h4.4c.7 0 1.3-.3 1.7-.8l2.2-.4c.6-.1.9-.7.6-1.3l-.7-1.4c.6-.7 1-1.6 1-2.7 0-2.1-1.1-3.7-2.3-5.3-.7-.9-1.2-1.7-1.2-2.7V6c0-2.2-1.4-3.8-3.5-3.8Zm-1.7 3.3c.5 0 .9.5.9 1.2s-.4 1.2-.9 1.2-.9-.5-.9-1.2.4-1.2.9-1.2Zm3.4 0c.5 0 .9.5.9 1.2s-.4 1.2-.9 1.2-.9-.5-.9-1.2.4-1.2.9-1.2ZM12 8.6c.9 0 1.7.5 1.7 1s-.8 1.1-1.7 1.1-1.7-.6-1.7-1.1.8-1 1.7-1Z' },
    /* iOS is a plain handset, not an apple: at 20 px an Apple mark would be indistinguishable
       from the Mac row, and nothing on the board says which of the two a run came from. */
    iOS:     { label: 'iPhone', stroke: 1, d: 'M7.5 2.8h9a1.7 1.7 0 0 1 1.7 1.7v15a1.7 1.7 0 0 1-1.7 1.7h-9a1.7 1.7 0 0 1-1.7-1.7v-15a1.7 1.7 0 0 1 1.7-1.7ZM10.2 4.9h3.6M12 18.4h.01' }
  };
  var SVG = 'http://www.w3.org/2000/svg';
  function platIcon(p) {
    var svg = document.createElementNS(SVG, 'svg'), path = document.createElementNS(SVG, 'path');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
    if (p.stroke) { svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.6'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round'); }
    else svg.setAttribute('fill', 'currentColor');
    path.setAttribute('d', p.d); svg.appendChild(path);
    return svg;
  }
  function own(set, v) { return Object.prototype.hasOwnProperty.call(set, v); }
  function titleOf(id) {
    if (typeof id !== 'string' || !id) return '';
    if (own(TITLE_OVERRIDE, id)) return TITLE_OVERRIDE[id];
    var s = id.replace(/^title_/, '').replace(/_/g, ' ').trim();
    return s.replace(/\b[a-z]/g, function (m) { return m.toUpperCase(); });
  }

  /* ---- the trust boundary: strings clamped to DB limits, score a finite number ---- */
  function str(v, max) { return typeof v === 'string' ? v.slice(0, max) : ''; }
  function normalize(j) {
    if (!Array.isArray(j)) throw new Error('bad payload');   // PostgREST errors arrive as a 200 object
    return j.slice(0, 100).map(function (r) {
      if (!r || typeof r !== 'object') r = {};
      /* title_text is the one admin-written free-text field (profiles.title_text); it wins over the title id */
      return { name: str(r.name, 24), title: str(r.title_text, 32) || titleOf(str(r.title, 24)), flair: str(r.flair, 16), font: str(r.font, 24), platform: str(r.platform, 16), score: Number(r.score) };
    }).filter(function (r) { return r.name && isFinite(r.score); });
  }

  var cache = {};
  function fetchBoard(mode, sides) {
    var k = mode + '|' + sides;
    if (cache[k]) return cache[k];
    var ac = new AbortController(), to = setTimeout(function () { ac.abort(); }, 8000);
    /* Same order as the game (net.gd LB_ORDER): on a tie the earlier submit ranks
       higher, which is also how the cup's champions view breaks ties. */
    var p = fetch(URL_BASE + '?select=name,flair,score,title,title_text,font,platform&mode=eq.' + mode + '&sides=eq.' + sides + '&order=score.desc,submitted_at.asc&limit=100', {
      headers: { apikey: KEY, Authorization: 'Bearer ' + KEY }, signal: ac.signal
    }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) { clearTimeout(to); return normalize(j); });
    p.catch(function () { clearTimeout(to); delete cache[k]; });
    return (cache[k] = p);
  }

  /* One player card. `row` = {name,title,font,flair,platform,score}. */
  function card(row, rank, tag) {
    var el = document.createElement(tag || 'li');
    el.className = 'pcard b-none' + (rank === 1 ? ' first' : '');
    var r = document.createElement('span'); r.className = 'rank'; r.textContent = rank;
    var who = document.createElement('div'); who.className = 'who';
    var flair = own(FLAIR, row.flair) ? row.flair : 'none';
    var pl = document.createElement('div');
    pl.className = 'plate' + (flair !== 'none' ? ' f-' + flair : '') + ' nf-' + (own(FONT, row.font) ? FONT[row.font] : 'nunito') + ' t-cyan';
    var nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = row.name; pl.appendChild(nm);
    if (row.title) { var ti = document.createElement('div'); ti.className = 'ti'; ti.textContent = row.title; pl.appendChild(ti); }
    who.appendChild(pl);
    /* platform: icon + label on wide screens, icon alone on phones (site.css hides the text);
       role=img + aria-label keeps the name for screen readers at every width. Unknown = empty
       span, which the page CSS collapses, so rows from older clients look exactly as before. */
    var pf = document.createElement('span'); pf.className = 'plat';
    if (own(PLAT, row.platform)) {
      var p = PLAT[row.platform];
      pf.setAttribute('role', 'img'); pf.setAttribute('aria-label', 'Played on ' + p.label);
      pf.appendChild(platIcon(p));
      var lb = document.createElement('span'); lb.textContent = p.label; pf.appendChild(lb);
    }
    var sc = document.createElement('span'); sc.className = 'score'; sc.textContent = new Intl.NumberFormat().format(row.score);
    el.appendChild(r); el.appendChild(who); el.appendChild(pf); el.appendChild(sc);
    return el;
  }

  window.PB = { MODES: MODES, fetchBoard: fetchBoard, card: card };
})();
