/* PolyBall leaderboard: live reads + the player card renderer.
   Reads the live Supabase `scores` table with the public (publishable) key,
   read-only select, same query shape the old landing used. When the cup
   migration (supabase/migrations) is applied, point URL_BASE at /rest/v1/board.
   Every cosmetic field is an id checked against a whitelist, then mapped to a
   class. Nothing from the wire is ever used as CSS or HTML. */
(function () {
  'use strict';

  var URL_BASE = 'https://osnwwrpkyvcflfcixwmw.supabase.co/rest/v1/scores';
  var KEY = 'sb_publishable_LvCJhoJY47Q-FIpaiBswfQ_2qzyx7tW';
  var MODES = ['Classic', 'Music', 'Time'];

  var FLAIR = { none:1, slate:1, neon:1, holo:1, circuit:1, frost:1, gilded:1, ember:1, 'void':1, bloom:1, carbon:1 };
  /* game font id -> card font class. ponytail: Fredoka / Baloo are not self-hosted
     here, so those plates fall back to Nunito; add the woff2s if players ask. */
  var FONT = { font_nunito:'nunito', font_heavy:'heavy', font_wide:'wide', font_slant:'slant', font_fredoka:'nunito', font_baloo:'nunito', font_sans:'nunito' };
  /* the only three title ids whose English string is not the id title-cased */
  var TITLE_OVERRIDE = { title_daily: 'Daily Devotee', title_shapes: 'Shapeshifter', title_nightowl: 'Night Owl' };
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
      return { name: str(r.name, 24), title: titleOf(str(r.title, 24)), flair: str(r.flair, 16), font: str(r.font, 24), score: Number(r.score) };
    }).filter(function (r) { return r.name && isFinite(r.score); });
  }

  var cache = {};
  function fetchBoard(mode, sides) {
    var k = mode + '|' + sides;
    if (cache[k]) return cache[k];
    var ac = new AbortController(), to = setTimeout(function () { ac.abort(); }, 8000);
    /* Same order as the game (net.gd LB_ORDER): on a tie the earlier submit ranks
       higher, which is also how the cup's champions view breaks ties. */
    var p = fetch(URL_BASE + '?select=name,flair,score,title,font&mode=eq.' + mode + '&sides=eq.' + sides + '&order=score.desc,submitted_at.asc&limit=100', {
      headers: { apikey: KEY, Authorization: 'Bearer ' + KEY }, signal: ac.signal
    }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) { clearTimeout(to); return normalize(j); });
    p.catch(function () { clearTimeout(to); delete cache[k]; });
    return (cache[k] = p);
  }

  /* One player card. `row` = {name,title,font,flair,score}. */
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
    var pf = document.createElement('span'); pf.className = 'plat';   // platform arrives with the cup migration
    var sc = document.createElement('span'); sc.className = 'score'; sc.textContent = new Intl.NumberFormat().format(row.score);
    el.appendChild(r); el.appendChild(who); el.appendChild(pf); el.appendChild(sc);
    return el;
  }

  window.PB = { MODES: MODES, fetchBoard: fetchBoard, card: card };
})();
