/* PolyBall landing page.
   Three jobs: the hero demo run, the live leaderboard, and a few small proofs.
   Every constant is copied from the game repo; the source file is named in a comment.
   No dependencies, no build step. */
(function () {
'use strict';

var RM = matchMedia('(prefers-reduced-motion: reduce)');
function onRM(fn) {  // Safari < 14 only has the legacy listener
  if (RM.addEventListener) RM.addEventListener('change', fn); else if (RM.addListener) RM.addListener(fn);
}
/* scripts/palette.gd PALETTE_63, entries 0-6 */
var P = ['#ff5a5a', '#ff9f43', '#ffd23f', '#4bd86b', '#3fd0e0', '#4a8cff', '#f45cd0'];
var PALETTE_63 = P.concat(['#b7f0ff','#ee1401','#ca06db','#139948','#e70672','#b08cfc','#7eea19','#c95b0a',
'#aade66','#a547ee','#fa99f2','#ffd9a1','#c25191','#10d231','#62b6ff','#1bd79e','#f93494','#088fe3',
'#2da413','#df32ef','#58eaa4','#f57595','#fb02b8','#eb9a04','#bd6dcd','#de3c37','#816ffb','#1fb870',
'#fc6518','#b3de1e','#d029b5','#4aaa4d','#d15efe','#53e439','#19affe','#ee043b','#05e857','#7bdb7b',
'#e0bf21','#da386e','#3ad017','#f182ca','#b625f4','#cfd445','#d85f3e','#84dc47','#b74bc2','#9464cd',
'#74f7d4','#f81f58','#7c91fd','#abc63e','#21ebbd','#e751a1','#f9262a','#8fd0ff']);

function $(id) { return document.getElementById(id); }

/* ======================================================================
   1. HERO — the demo run
   Geometry: scripts/player/player_polygon.gd (MENU_RADIUS 218, 7 straight
   chords, round caps). Matches the game's in-run ring exactly:
     - rest pose poly_rotation = -90 (start_game), so for odd N a flat edge
       sits on top, square under the falling ball;
     - one step = 360/N over STEP_TIME 90 ms, TRANS_CUBIC EASE_IN_OUT
       (step_rotate + Motion.RING);
     - left = +1 = counter-clockwise, right = -1 = clockwise (rotate_left /
       rotate_right, TouchInput left/right half);
     - no idle spin and no breathing: start_game() stops both.
   Autopilot taps like a player, one settled step at a time, until the
   visitor taps a side or presses an arrow, then the run is theirs.
   Timing:   scripts/player/ball.gd (fall = 0.54 + 1.8/tempo).
   ====================================================================== */
(function hero() {
  var cv = $('ring'); if (!cv) return;
  var ctx = cv.getContext('2d', { alpha: true });
  var lay = document.createElement('canvas');       // ring layer, reused for the bloom pass
  var lctx = lay.getContext('2d');

  /* The game's own 720x1280 device-px space, cropped to the ring: R and W are the
     shipped MENU_RADIUS 218 / MAX_SEGMENT_WIDTH 24, the box is just tighter. */
  var VW = 560, VH = 740, CX = 280, CY = 420, R = 218, W = 24, N = 7, S = 360 / N;
  var APO = R * Math.cos(Math.PI / N);              // 196.4
  var CONTACT = CY - APO - W / 2 - 16;              // ball centre y at contact
  var REST = -90;                                   // player_polygon.gd start_game()
  var STEP_T = 0.09, TAP_GAP = 0.2;                 // STEP_TIME; autopilot tap spacing (step lands, then holds)
  var SPAWN = 30, BR = 16;                          // VISUAL_RADIUS is pinned at 16
  var CAD = [1.0, 1.2, 1.45, 1.6, 1.75];            // TEMPO_CADENCE
  var LIFT = [1.0, 1.16, 1.22, 1.30];               // FEVER_RING_BY_TIER
  var DEATH_RED = '#FF6A80';                        // VFX death red, not the UI danger token

  var scale = 1, cssW = 0, cssH = 0, running = false, raf = 0, blurOK = false;
  var st = null, lastCap = '';

  function wrap180(d) { return ((d + 180) % 360 + 360) % 360 - 180; }
  function vert(i, rot) {
    var a = (-(i * S) - rot) * Math.PI / 180;
    return { x: CX + R * Math.cos(a), y: CY + R * Math.sin(a) };
  }
  var tintCache = {};
  function tint(hex, k) {
    var key = hex + k;
    if (tintCache[key]) return tintCache[key];
    var n = parseInt(hex.slice(1), 16);
    var r = Math.min(255, (n >> 16 & 255) * k) | 0,
        g = Math.min(255, (n >> 8 & 255) * k) | 0,
        b = Math.min(255, (n & 255) * k) | 0;
    return (tintCache[key] = 'rgb(' + r + ',' + g + ',' + b + ')');
  }
  function ease(u) { return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; }

  function reset(now) {
    st = { player: false, stepFrom: REST, stepTo: REST, stepT0: -9, steps: [], stepIdx: 0,
           catches: 0, prevK: -1, k: 0, fall: 2.34, tier: 0, t0: now, phase: 'fall',
           trail: [], flash: -1, flashT: -9, pulseT: -9, deadIdx: -1, deadT: 0,
           ballX: CX, ballY: SPAWN, deathAt: 11 + ((Math.random() * 7) | 0), willDie: false, alpha: 1 };
    plan(now);
  }
  function stepOffset(now) {
    var u = Math.min(1, Math.max(0, (now - st.stepT0) / STEP_T));
    return st.stepFrom + (st.stepTo - st.stepFrom) * ease(u);
  }
  function plan(now) {
    var k; do { k = (Math.random() * N) | 0; } while (k === st.prevK);
    st.prevK = k; st.k = k;
    var c = st.catches;
    /* same ladder as proofs(): FEVER 8 / MEGA 16 / ULTRA 28, warm at 4 */
    var tier = c >= 28 ? 4 : c >= 16 ? 3 : c >= 8 ? 2 : c >= 4 ? 1 : 0;
    var tempo = Math.min(CAD[tier] * Math.min(1 + 0.0125 * c, 2.2), 4);
    st.tier = tier;
    st.fall = 0.54 + 1.8 / tempo;
    st.t0 = now; st.trail = []; st.phase = 'fall'; st.ballY = SPAWN; st.ballX = CX;
    st.steps = []; st.stepIdx = 0;
    if (st.player) return;
    // Solve the autopilot: how many steps put segment k on top at contact?
    var n = Math.round(wrap180(90 - (k - 0.5) * S - st.stepTo) / S);
    st.willDie = (c === st.deathAt);
    if (st.willDie) n += (Math.random() < 0.5 ? 1 : -1);
    var m = Math.abs(n), dir = n < 0 ? -1 : 1;
    for (var j = 0; j < m; j++) {
      // land the last step with ~12% of the fall left, so every catch reads as a near-miss
      st.steps.push({ t: now + 0.88 * st.fall - STEP_T - (m - 1 - j) * TAP_GAP, dir: dir });
    }
  }
  function segAtTop(rot) {
    var best = 0, bd = 999;
    for (var i = 0; i < N; i++) {
      var d = Math.abs(wrap180(90 - (i - 0.5) * S - rot));
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  function resize() {
    var w = cv.clientWidth; if (!w) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    cssW = w; cssH = w * VH / VW;
    cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
    cv.style.height = cssH + 'px';
    lay.width = cv.width; lay.height = cv.height;
    scale = cv.width / VW;
    lctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    blurOK = (typeof ctx.filter === 'string');
  }

  function drawScene(now) {
    var rot = stepOffset(now);
    var t = now;
    // catch pulse only: the menu breathing stops when a run starts (start_game)
    var s = 1;
    var pu = (t - st.pulseT) / 0.34;
    if (pu >= 0 && pu < 1) s += 0.05 * (1 - pu) * (1 - pu);
    var bright = LIFT[Math.min(3, st.tier)];

    lctx.setTransform(scale, 0, 0, scale, 0, 0);
    lctx.clearRect(0, 0, VW, VH);
    lctx.globalAlpha = st.alpha;
    lctx.save();
    lctx.translate(CX, CY); lctx.scale(s, s); lctx.translate(-CX, -CY);
    lctx.lineCap = 'round'; lctx.lineJoin = 'round'; lctx.lineWidth = W;
    for (var i = 0; i < N; i++) {
      var a = vert(i, rot), b = vert((i - 1 + N) % N, rot);
      lctx.strokeStyle = (i === st.deadIdx) ? DEATH_RED : tint(P[i], bright);
      lctx.beginPath(); lctx.moveTo(a.x, a.y); lctx.lineTo(b.x, b.y); lctx.stroke();
    }
    // catch flash: white overlay on the caught segment only
    var fu = (t - st.flashT) / 0.24;
    if (st.flash >= 0 && fu >= 0 && fu < 1) {
      var d = 1 - fu; d = d * (2 - d);                        // quad-out
      var va = vert(st.flash, rot), vb = vert((st.flash - 1 + N) % N, rot);
      lctx.strokeStyle = 'rgba(255,255,255,' + (0.65 * d).toFixed(3) + ')';
      lctx.lineWidth = W + 6 * d;
      lctx.beginPath(); lctx.moveTo(va.x, va.y); lctx.lineTo(vb.x, vb.y); lctx.stroke();
      lctx.lineWidth = W;
    }
    lctx.restore();

    // trail, then ball
    if (st.phase !== 'dead' || (t - st.deadT) < 0.4) {
      var pts = st.trail, col = P[st.k];
      if (pts.length > 1) {
        for (var j = 1; j < pts.length; j++) {
          var f = 1 - (j / pts.length);
          lctx.strokeStyle = col; lctx.globalAlpha = st.alpha * f * 0.85;
          lctx.lineWidth = 24 * f;
          lctx.beginPath(); lctx.moveTo(pts[j - 1].x, pts[j - 1].y); lctx.lineTo(pts[j].x, pts[j].y); lctx.stroke();
        }
        lctx.globalAlpha = st.alpha;
      }
      var sq = 1, sqy = 1;
      if (st.phase === 'catch') {
        var u = Math.min(1, (t - st.catchT) / 0.18);
        var damp = Math.exp(-4.5 * u) * Math.cos(9 * u);
        sq = 1 + 0.22 * damp; sqy = 1 - 0.28 * damp;
      }
      lctx.save();
      lctx.translate(st.ballX, st.ballY); lctx.scale(sq, sqy);
      lctx.fillStyle = col; lctx.beginPath(); lctx.arc(0, 0, BR, 0, 6.2832); lctx.fill();
      lctx.restore();
    }
    lctx.globalAlpha = 1;

    // ---- composite: crisp pass, then one global additive bloom (shaders/bloom.gdshader) ----
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(lay, 0, 0);
    if (blurOK) {
      ctx.save();
      ctx.filter = 'blur(' + (5.5 * scale).toFixed(2) + 'px)';
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.85;
      ctx.drawImage(lay, 0, 0);
      ctx.restore();
    }
    // fever wash (main.gd): warm gold, additive, only from tier 1
    if (st.tier > 0) {
      // fades to fully transparent at the rim so the canvas box never reads as a panel
      var g = ctx.createRadialGradient(CX * scale, CY * scale, 0, CX * scale, CY * scale, R * 1.6 * scale);
      g.addColorStop(0, 'rgba(255,170,50,0.05)');
      g.addColorStop(0.6, 'rgba(255,170,50,0.11)');
      g.addColorStop(1, 'rgba(255,170,50,0)');
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g;
      ctx.fillRect(0, 0, cv.width, cv.height); ctx.restore();
    }
    // death punch: 220 ms vignette; chromatic split only >= 768 px
    if (st.phase === 'dead') {
      var du = (t - st.deadT) / 0.22;
      if (du < 1) {
        var k = 1 - du;
        if (cssW >= 360 && window.innerWidth >= 768) {
          ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35 * k;
          ctx.drawImage(lay, 3.5 * scale, 0); ctx.drawImage(lay, -3.5 * scale, 0); ctx.restore();
        }
        var vg = ctx.createRadialGradient(cv.width / 2, cv.height / 2, cv.width * 0.2, cv.width / 2, cv.height / 2, cv.width * 0.72);
        vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,' + (0.5 * k).toFixed(3) + ')');
        ctx.fillStyle = vg; ctx.fillRect(0, 0, cv.width, cv.height);
      }
      cv.style.filter = du < 1 ? 'saturate(' + (0.85 + 0.15 * du).toFixed(2) + ')' : '';
    } else if (cv.style.filter) { cv.style.filter = ''; }
  }

  var cap = $('ringCap');
  function setCap(text, over) {
    if (text === lastCap) return;
    lastCap = text; cap.textContent = text;
    cap.classList.toggle('over', !!over);
  }

  function tally() {
    return (st.player ? 'Your run · ' : 'Demo run · ') + st.catches + (st.catches === 1 ? ' catch' : ' catches');
  }
  function update(now) {
    if (st.phase === 'fall') {
      while (st.stepIdx < st.steps.length && now >= st.steps[st.stepIdx].t) {
        st.stepFrom = stepOffset(now);
        st.stepTo += st.steps[st.stepIdx].dir * S;
        st.stepT0 = now; st.stepIdx++;
      }
      var p = (now - st.t0) / st.fall;
      st.ballY = SPAWN + (CONTACT - SPAWN) * Math.min(1, p);
      var last = st.trail[st.trail.length - 1];
      if (!last || Math.abs(st.ballY - last.y) >= 6) {
        st.trail.push({ x: st.ballX, y: st.ballY });
        if (st.trail.length > 24) st.trail.shift();
      }
      if (p >= 1) {
        var hit = segAtTop(stepOffset(now));
        if (hit === st.k) {
          st.phase = 'catch'; st.catchT = now; st.flash = hit; st.flashT = now; st.pulseT = now;
          st.catches++;
        } else {
          st.phase = 'dead'; st.deadT = now; st.deadIdx = hit;
        }
      }
      setCap(tally(), false);
    } else if (st.phase === 'catch') {
      var u = Math.min(1, (now - st.catchT) / 0.28);
      st.ballY = CONTACT + (CY - CONTACT) * ease(u);
      if (u >= 1) plan(now);
      setCap(tally(), false);
    } else if (st.phase === 'dead') {
      var e = now - st.deadT;
      st.alpha = e < 1.1 ? 1 : Math.max(0, 1 - (e - 1.1) / 0.6);
      setCap('Run over · ' + st.catches + (st.catches === 1 ? ' catch' : ' catches'), true);
      // after a visitor's run ends, the demo takes back over on the next reset
      if (e > 2.1) reset(now);
    }
  }

  var prev = 0;
  function frame(ms) {
    var now = ms / 1000;
    st.dt = Math.min(0.05, prev ? now - prev : 0.016); prev = now;
    update(now); drawScene(now);
    if (running) raf = requestAnimationFrame(frame);
  }

  function staticFrame() {
    // prefers-reduced-motion: one composed frame, rAF never starts.
    // reset() first so a mid-run switch cannot leave a red dead segment or faded alpha;
    // the ball colour is derived from the ring, so the frame is one the game could produce.
    reset(0);
    st.catches = 4; st.tier = 1; st.ballY = 140;
    st.stepFrom = st.stepTo = REST; st.stepT0 = -9;
    st.k = segAtTop(REST);
    drawScene(0);
  }

  var btn = $('ringToggle'), icon = $('ringIcon');
  var PLAY = 'M8 5l11 7-11 7z', PAUSE = 'M8 5h3v14H8zM13 5h3v14h-3z';
  /* The canvas label describes what is on screen, so it has to follow the motion:
     a paused canvas that still claims to be spinning is a lie only screen-reader
     users are told. Kept next to the icon/button-label flip so the three cannot drift. */
  var LBL_MOVING = cv.getAttribute('aria-label');
  var LBL_STILL = 'Paused demo run: a seven-sided ring of coloured segments with a ball above the matching colour. Press Left or Right arrow, or tap the left or right half, to start a run and turn the ring.';
  function setRunning(on) {
    if (on === running) return;
    running = on;
    icon.firstChild.setAttribute('d', on ? PAUSE : PLAY);
    btn.setAttribute('aria-label', on ? 'Pause hero animation' : 'Play hero animation');
    cv.setAttribute('aria-label', on ? LBL_MOVING : LBL_STILL);
    /* The run clock is performance.now(); it keeps advancing while rAF is stopped,
       so resuming without a reset leaves (now - st.t0) way past st.fall and the
       first frame scores an instant miss. Reset here rather than in each caller —
       the play button, the intersection observer and visibilitychange all resume
       through this one function. */
    if (on) { prev = 0; reset(performance.now() / 1000); raf = requestAnimationFrame(frame); } else { cancelAnimationFrame(raf); }
  }
  btn.addEventListener('click', function () { userPaused = running; setRunning(!running); });

  /* Visitor input = the game's step controls (player_polygon.gd step_rotate):
     left = +1 (CCW), right = -1 (CW). The first input ends the autopilot for this run. */
  function step(dir) {
    if (!running) { userPaused = false; setRunning(true); }
    var now = performance.now() / 1000;
    if (st.phase === 'dead') reset(now);
    if (!st.player) { st.player = true; st.steps = []; st.stepIdx = 0; }
    st.stepFrom = stepOffset(now); st.stepTo += dir * S; st.stepT0 = now;
  }
  cv.addEventListener('pointerdown', function (e) {
    if (e.button) return;
    var r = cv.getBoundingClientRect();
    step(e.clientX - r.left < r.width / 2 ? 1 : -1);
  });
  cv.addEventListener('keydown', function (e) {
    var dir = e.key === 'ArrowLeft' ? 1 : e.key === 'ArrowRight' ? -1 : 0;
    if (!dir) return;
    e.preventDefault(); step(dir);
  });

  var userPaused = false, visible = true;
  function stillMode() {
    setRunning(false);
    staticFrame();
    icon.firstChild.setAttribute('d', PLAY);
    btn.setAttribute('aria-label', 'Play hero animation');
    cv.setAttribute('aria-label', LBL_STILL);
    setCap('Demo run · paused', false);   // the caption must not describe motion that is not happening
  }
  resize();
  reset(0);
  if (RM.matches) stillMode(); else setRunning(true);
  /* Sampling the media query once meant an OS-level toggle did nothing until reload. */
  onRM(function () {
    if (RM.matches) { stillMode(); }
    else { userPaused = false; reset(performance.now() / 1000); setRunning(true); }
  });
  addEventListener('resize', function () {
    resize();
    if (!running) { RM.matches ? staticFrame() : drawScene(prev || 0); }
  }, { passive: true });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      visible = es[0].isIntersecting;
      if (!RM.matches && !userPaused) setRunning(visible && !document.hidden);
    }, { threshold: 0.05 }).observe(cv);
  }
  document.addEventListener('visibilitychange', function () {
    if (!RM.matches && !userPaused) setRunning(!document.hidden && visible);
  });
})();

/* ======================================================================
   2. Small proofs: the fall-time bars and the 63-colour grid
   ====================================================================== */
(function proofs() {
  var CAD = [1.0, 1.2, 1.45, 1.6, 1.75];
  function fallAt(c) {
    /* scoring_system.gd FEVER_COMBO 8 / MEGA_COMBO 16 / ULTRA_COMBO 28,
       plus ball.gd TEMPO_WARM_COMBO 4 */
    var tier = c >= 28 ? 4 : c >= 16 ? 3 : c >= 8 ? 2 : c >= 4 ? 1 : 0;
    return 0.54 + 1.8 / Math.min(CAD[tier] * Math.min(1 + 0.0125 * c, 2.2), 4);
  }
  var f = document.getElementById('falls');
  if (f) {
    var frag = document.createDocumentFragment();
    for (var c = 0; c <= 20; c++) {
      var i = document.createElement('i');
      i.style.height = (fallAt(c) / 2.34 * 100).toFixed(1) + '%';
      frag.appendChild(i);
    }
    f.appendChild(frag);
  }
  /* The grid is illustration — the paragraph above it already makes the claim in
     words. It is aria-hidden in the markup, so no visually-hidden labels here:
     they would only make a screen reader read sixty-three hex codes. */
  var sw = document.getElementById('swatches');
  if (sw) {
    var fr = document.createDocumentFragment();
    for (var j = 0; j < PALETTE_63.length; j++) {
      var e = document.createElement('i');
      e.style.background = PALETTE_63[j];
      e.title = 'Colour ' + (j + 1) + ': ' + PALETTE_63[j];
      fr.appendChild(e);
    }
    sw.appendChild(fr);
  }
})();

/* ======================================================================
   3. LIVE LEADERBOARD (Supabase REST, read-only)
   The anon key is a PUBLISHABLE key already shipped inside released game
   binaries; RLS policy lb_read is "for select using (true)".
   Every value below is remote data and is inserted with textContent only.
   ====================================================================== */
(function board() {
  var URL_BASE = 'https://osnwwrpkyvcflfcixwmw.supabase.co/rest/v1/scores';
  var KEY = 'sb_publishable_LvCJhoJY47Q-FIpaiBswfQ_2qzyx7tW';

  var FLAIRS = { none:1, slate:1, neon:1, holo:1, circuit:1, frost:1, gilded:1, ember:1, void:1, bloom:1, carbon:1 };
  var FONTS = {
    font_nunito: { f: 'Nunito, sans-serif', w: 700 },
    font_heavy:  { f: 'Nunito, sans-serif', w: 900 },
    font_wide:   { f: 'Nunito, sans-serif', w: 700, ls: '.22em' },
    font_fredoka:{ f: '"Fredoka", Nunito, sans-serif', w: 600, load: 'Fredoka:wght@600' },
    font_slant:  { f: '"Fredoka", Nunito, sans-serif', w: 600, skew: 1, load: 'Fredoka:wght@600' },
    font_baloo:  { f: '"Baloo 2", Nunito, sans-serif', w: 600, load: 'Baloo+2:wght@600' },
    font_sans:   { f: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', w: 700 }
  };
  /* The only three ids whose English string (assets/i18n/polyball.csv,
     FLAIR_TITLE_*) is not just the id title-cased. The other 45 derive cleanly. */
  var TITLE_OVERRIDE = { title_daily: 'Daily Devotee', title_shapes: 'Shapeshifter', title_nightowl: 'Night Owl' };
  var MODE_NAME = ['Classic', 'Music', 'Time'];
  var MEDAL = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 2h10l-2.5 6h-5L7 2Zm5 6.5a6 6 0 1 1 0 12 6 6 0 0 1 0-12Zm0 2.6-1.1 2.3-2.5.4 1.8 1.8-.4 2.5 2.2-1.2 2.2 1.2-.4-2.5 1.8-1.8-2.5-.4L12 11.1Z"/></svg>';

  var loaded = {};
  function loadFont(spec) {
    if (!spec || loaded[spec]) return;
    loaded[spec] = 1;
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=' + spec + '&display=swap';
    document.head.appendChild(l);
  }
  function titleOf(id) {
    if (typeof id !== 'string' || !id) return '';
    if (TITLE_OVERRIDE.hasOwnProperty(id)) return TITLE_OVERRIDE[id];
    var s = id.replace(/^title_/, '').replace(/_/g, ' ').trim();
    if (!s) return '';
    return s.replace(/\b[a-z]/g, function (m) { return m.toUpperCase(); });
  }

  var tbody = $('lbBody'), status = $('lbStatus'), caption = $('lbCaption'),
      more = $('lbMore'), retry = $('lbRetry'), cta = $('lbCta'), bossLine = $('bossLine'),
      sidesSel = $('sides'), bestInput = $('best'), tabs = [].slice.call(document.querySelectorAll('.tab'));

  /* Default to 5 sides: that is where the closed-test board actually has runs today.
     Change HERO_SIDES too if you change this. */
  var HERO_SIDES = 5;
  var state = { mode: 0, sides: HERO_SIDES, rows: null, shown: 20, best: null, err: false };
  var cache = {};
  var fmt = new Intl.NumberFormat();

  for (var v = 3; v <= 63; v += 2) {
    var o = document.createElement('option');
    o.value = String(v); o.textContent = String(v);
    sidesSel.appendChild(o);
  }

  function key() { return state.mode + '|' + state.sides; }

  /* ---- the trust boundary ----
     Everything past this point may assume a row is an object whose four string
     fields are strings clamped to their DB limits (name/title text 24, flair 16,
     font 24) and whose score is a FINITE Number. Clamping here is what keeps a
     hostile or buggy backend from throwing inside plate() or inflating a row to
     full-screen height; every sink downstream is safe without its own guard.
     A row with no usable score is dropped rather than kept for the '—' cell:
     kept, it still drew a "+NaN" delta chip, sorted above the player's ghost row
     (every `best > NaN` is false) and was counted in the rank and the caption. */
  function str(v, max) { return typeof v === 'string' ? v.slice(0, max) : ''; }
  function normalize(j) {
    /* A 200 whose body is an object, not an array, is PostgREST reporting a failure
       ({"message":..,"code":"42501"} on an RLS or schema error). Returning [] made it
       indistinguishable from an empty board: the page printed "No runs recorded yet",
       hid Retry, and the only way back was a reload. Throwing routes it into load()'s
       .catch, which is both true and recoverable. */
    if (!Array.isArray(j)) throw new Error('bad payload');
    return j.slice(0, 50).map(function (r) {
      if (!r || typeof r !== 'object') r = {};
      return { name: str(r.name, 24), title: str(r.title, 24), flair: str(r.flair, 16),
               font: str(r.font, 24), score: Number(r.score) };
    }).filter(function (r) { return isFinite(r.score); });
  }

  function fetchBoard(mode, sides) {
    var k = mode + '|' + sides;
    if (cache[k]) return cache[k];
    var ac = new AbortController();
    var to = setTimeout(function () { ac.abort(); }, 8000);
    var url = URL_BASE + '?select=name,flair,score,title,font&mode=eq.' + mode +
              '&sides=eq.' + sides + '&order=score.desc&limit=50';
    var p = fetch(url, {
      headers: { apikey: KEY, Authorization: 'Bearer ' + KEY },
      signal: ac.signal
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();     // clear the abort AFTER the body, or a wedged stream buffers forever
    }).then(function (j) {
      clearTimeout(to);
      return normalize(j);
    });
    cache[k] = p;
    p.catch(function () { clearTimeout(to); delete cache[k]; });
    return p;
  }

  /* ---- one plate, built entirely with createElement + textContent ---- */
  function plate(row) {
    var el = document.createElement('div');
    el.className = 'plate';
    /* Own-property checks: plain bracket lookup lets inherited Object.prototype keys
       ("constructor", "__proto__", "toString") pass the whitelist. */
    var flair = FLAIRS.hasOwnProperty(row.flair) ? row.flair : 'none';
    if (flair !== 'none') el.className = 'plate framed f-' + flair;

    var fd = FONTS.hasOwnProperty(row.font) ? FONTS[row.font] : FONTS.font_nunito;
    loadFont(fd.load);

    var nm = document.createElement('div');
    nm.className = 'nm';
    nm.style.fontFamily = fd.f;
    nm.style.fontWeight = String(fd.w);
    if (fd.ls) nm.style.letterSpacing = fd.ls;
    if (fd.skew) nm.style.transform = 'skewX(-12.4deg)';
    nm.textContent = row.name;
    el.appendChild(nm);

    var t = titleOf(row.title);
    if (t) {
      var ti = document.createElement('div');
      ti.className = 'ti';
      ti.style.fontFamily = fd.f;
      if (fd.skew) ti.style.transform = 'skewX(-12.4deg)';
      ti.textContent = t;
      el.appendChild(ti);
    }
    return el;
  }

  function makeRow(rank, row, opts) {
    var tr = document.createElement('tr');
    opts = opts || {};
    if (rank === 1 && !opts.ghost) tr.className = 'boss';
    if (opts.ghost) tr.className = 'ghost';

    var td1 = document.createElement('td');
    td1.className = 'rank';
    if (rank <= 3 && !opts.ghost) {
      var m = document.createElement('span');
      m.innerHTML = MEDAL;                       // static literal, no remote data
      m.style.color = rank === 1 ? 'var(--coin)' : rank === 2 ? 'rgba(237,238,242,.6)' : '#CD7F32';
      td1.appendChild(m);
      td1.style.color = rank === 1 ? 'var(--coin)' : rank === 2 ? 'rgba(237,238,242,.6)' : '#CD7F32';
    }
    td1.appendChild(document.createTextNode(String(rank)));
    tr.appendChild(td1);

    var td2 = document.createElement('td');
    td2.className = 'plate-cell';
    var p = plate(row);
    if (rank === 1 && !opts.ghost) {
      var wrapEl = document.createElement('div');
      wrapEl.className = 'plate-wrap';
      wrapEl.appendChild(p);
      td2.appendChild(wrapEl);
    } else td2.appendChild(p);
    tr.appendChild(td2);

    var td3 = document.createElement('td');
    td3.className = 'score';
    if (rank <= 3 && !opts.ghost) td3.style.color = 'var(--coin)';
    var n = Number(row.score);
    td3.textContent = isFinite(n) ? fmt.format(n) : '—';
    if (opts.delta != null) {
      var chip = document.createElement('span');
      chip.className = 'deltachip';
      chip.textContent = '+' + fmt.format(opts.delta);
      var vh = document.createElement('span');   // otherwise the cell reads "521 +479" with no explanation
      vh.className = 'vh';
      vh.textContent = ' ahead of your best run';
      chip.appendChild(vh);
      td3.appendChild(chip);
    }
    tr.appendChild(td3);
    return tr;
  }

  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

  /* Hiding the element the user just activated drops focus to <body> and the
     next Tab restarts at the top of the document. Send it to the status line,
     which is exactly what just announced the result of the press. */
  function hide(el) {
    var had = document.activeElement === el;
    el.hidden = true;
    if (had) status.focus();
  }

  function skeleton() {
    clear(tbody);
    for (var i = 0; i < 8; i++) {
      var tr = document.createElement('tr');
      var a = document.createElement('td'); a.className = 'rank'; a.textContent = String(i + 1);
      var b = document.createElement('td'); b.className = 'plate-cell';
      var s = document.createElement('div'); s.className = 'skel'; b.appendChild(s);
      var c = document.createElement('td'); c.className = 'score';
      tr.appendChild(a); tr.appendChild(b); tr.appendChild(c);
      tbody.appendChild(tr);
    }
  }

  function message(text, showRetry) {
    clear(tbody);
    var tr = document.createElement('tr');
    var td = document.createElement('td');
    td.colSpan = 3;
    td.style.padding = '18px 0';
    td.style.color = 'var(--mid)';
    td.textContent = text;
    tr.appendChild(td); tbody.appendChild(tr);
    if (showRetry) retry.hidden = false; else hide(retry);
    hide(more);
    bossLine.hidden = true;
  }

  function render() {
    var rows = state.rows;
    if (!rows) return;
    clear(tbody);
    hide(retry);

    if (!rows.length) {
      message('No runs recorded yet at ' + state.sides + ' sides in ' + MODE_NAME[state.mode] +
              '. The first score here is yours.', false);
      status.textContent = 'No runs yet at ' + state.sides + ' sides in ' + MODE_NAME[state.mode] + '.';
      caption.textContent = 'No ' + MODE_NAME[state.mode] + ' runs at ' + state.sides + ' sides';
      cta.textContent = 'Join the closed test';
      return;
    }

    var best = state.best;
    var ghostAt = -1;
    if (best != null) {
      ghostAt = rows.length;
      for (var i = 0; i < rows.length; i++) { if (best > Number(rows[i].score)) { ghostAt = i; break; } }
    }

    var limit = Math.min(state.shown, rows.length);
    var frag = document.createDocumentFragment();
    var rank = 0;
    for (var j = 0; j < limit; j++) {
      /* The ghost row TAKES a rank, it does not share one: printing j+1 for both
         it and the real row below it numbered two rows 4 and pushed everyone
         after them one place too high. */
      if (ghostAt === j) frag.appendChild(makeRow(++rank, { name: 'YOU', title: '', flair: 'none', score: best }, { ghost: true }));
      var delta = (ghostAt >= 0 && j < ghostAt) ? Number(rows[j].score) - best : null;
      frag.appendChild(makeRow(++rank, rows[j], { delta: delta }));
    }
    /* ghostAt can land past the rows actually drawn — at rows.length when the player
       is below every returned run, or between state.shown and rows.length behind the
       Show-all fold. The loop can never match either, so the status line announced a
       rank whose row was never rendered. Emit it at its true rank instead. */
    if (ghostAt >= limit) {
      frag.appendChild(makeRow(ghostAt + 1, { name: 'YOU', title: '', flair: 'none', score: best }, { ghost: true }));
    }
    tbody.appendChild(frag);

    var reveal = tbody.querySelectorAll('tr');
    if (!RM.matches) {
      for (var r = 0; r < Math.min(10, reveal.length); r++) {
        var el = reveal[r];
        el.style.opacity = '0'; el.style.transform = 'translateY(12px)';
        el.style.transition = 'opacity 300ms ease-out ' + (r * 30) + 'ms, transform 300ms ease-out ' + (r * 30) + 'ms';
        /* eslint-disable no-unused-expressions */
        el.offsetHeight;
        el.style.opacity = ''; el.style.transform = '';
      }
    }

    /* The count is written every render: a hardcoded "Show all 50" is the button's
       accessible name promising rows the board may not have. */
    if (rows.length > state.shown) { more.textContent = 'Show all ' + rows.length; more.hidden = false; } else hide(more);
    var topName = rows[0].name || 'the leader';
    bossLine.hidden = false;
    clear(bossLine);
    bossLine.appendChild(document.createTextNode('Nobody has beaten '));
    var b = document.createElement('b'); b.textContent = topName; bossLine.appendChild(b);
    bossLine.appendChild(document.createTextNode(' at ' + state.sides + ' sides.'));

    caption.textContent = 'Top ' + rows.length + ' ' + MODE_NAME[state.mode] + ' runs at ' + state.sides + ' sides';

    if (best != null && ghostAt >= 0) {
      var pos = ghostAt + 1;
      /* +1: the player is counted in the field they are ranked within, so a best
         below all 50 rows reads "51st of 51", never the impossible "51st of 50". */
      status.textContent = 'You would rank ' + ordinal(pos) + ' of ' + (rows.length + 1) + '.';
      var above = ghostAt > 0 ? rows[ghostAt - 1] : null;
      cta.textContent = above && above.name
        ? 'Pass ' + above.name + ': join the closed test'
        : 'Take the top spot: join the closed test';
    } else {
      status.textContent = 'Top ' + rows.length + ' ' + MODE_NAME[state.mode] + ' runs at ' + state.sides + ' sides loaded.';
      cta.textContent = 'Join the closed test';
    }
  }

  function ordinal(n) {
    var s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  function load() {
    state.rows = null; state.shown = 20;
    skeleton();
    hide(retry);   // the request is already in flight; Retry reappears only if it fails too
    status.textContent = 'Loading the ' + MODE_NAME[state.mode] + ' board at ' + state.sides + ' sides…';
    caption.textContent = 'Loading ' + MODE_NAME[state.mode] + ' runs at ' + state.sides + ' sides';
    var k = key();
    fetchBoard(state.mode, state.sides).then(function (rows) {
      if (k !== key()) return;
      state.rows = rows; render();
    }).catch(function () {
      if (k !== key()) return;
      state.rows = null;
      message('Could not reach the leaderboard.', true);
      caption.textContent = 'Leaderboard unavailable';
      status.textContent = 'The leaderboard could not be loaded. Use Retry to try again.';
    });
  }

  function syncHash() {
    try {
      history.replaceState(null, '', '#leaderboard?mode=' + state.mode + '&sides=' + state.sides);
    } catch (e) { /* file:// or blocked history — the board still works */ }
  }

  tabs.forEach(function (t) {
    t.addEventListener('click', function () {
      state.mode = Number(t.dataset.mode);
      tabs.forEach(function (o) { o.setAttribute('aria-pressed', String(o === t)); });
      syncHash(); load();
    });
  });
  sidesSel.addEventListener('change', function () {
    state.sides = Number(sidesSel.value) || 7;
    syncHash(); load();
  });
  more.addEventListener('click', function () { state.shown = 50; render(); });  // render() hides it and moves focus
  retry.addEventListener('click', function () { delete cache[key()]; load(); });

  var deb;
  bestInput.addEventListener('input', function () {
    clearTimeout(deb);
    deb = setTimeout(function () {
      var v = bestInput.value.trim();
      var n = v === '' ? null : Math.max(0, Math.min(999999, Math.floor(Number(v))));
      state.best = (n == null || !isFinite(n)) ? null : n;
      try { state.best == null ? localStorage.removeItem('polyball.best') : localStorage.setItem('polyball.best', String(state.best)); } catch (e) {}
      if (state.rows) render();
    }, 250);
  });

  /* boot: URL hash wins, then localStorage for the chase input */
  (function boot() {
    var m = /mode=(\d)/.exec(location.hash), s = /sides=(\d+)/.exec(location.hash);
    if (m && Number(m[1]) >= 0 && Number(m[1]) <= 2) state.mode = Number(m[1]);
    if (s) { var sv = Number(s[1]); if (sv >= 3 && sv <= 63 && sv % 2 === 1) state.sides = sv; }
    sidesSel.value = String(state.sides);
    tabs.forEach(function (o) { o.setAttribute('aria-pressed', String(Number(o.dataset.mode) === state.mode)); });
    try {
      /* Same clamp the input handler applies. A tampered "abc" used to set best = NaN,
         which passes the `best != null` gate and poisons every delta and the rank line. */
      var n = Number(localStorage.getItem('polyball.best'));
      if (isFinite(n) && n > 0) {
        state.best = Math.min(999999, Math.floor(n));
        bestInput.value = String(state.best);
      }
    } catch (e) {}
    load();
  })();

  /* hero tension line — same fetch, same cache, removed entirely if it fails */
  var tension = $('tension');
  fetchBoard(0, HERO_SIDES).then(function (rows) {
    /* clear(), not remove(): .tension reserves 44px precisely so a failed or slow
       board does not reflow the hero seconds after paint. */
    if (!rows.length) { clear(tension); return; }
    /* Bail rather than guess. `|| 0` turned a junk score into a confident "0" and an
       unguarded name printed blank, so the most prominent line on the page stated a
       fact from data this page does not control. Removing the line is already this
       block's failure mode, so no new UI is needed. */
    var s = Number(rows[0].score);
    if (!isFinite(s) || !rows[0].name) { clear(tension); return; }
    clear(tension);
    tension.appendChild(document.createTextNode('Right now the best ' + HERO_SIDES + '-sided Classic run is '));
    var b = document.createElement('b');
    b.textContent = fmt.format(s);
    tension.appendChild(b);
    tension.appendChild(document.createTextNode(' by '));
    var n = document.createElement('b');
    n.style.color = 'var(--fg)';
    n.textContent = rows[0].name;
    tension.appendChild(n);
    tension.appendChild(document.createTextNode('.'));
  }).catch(function () { clear(tension); });
})();

/* ======================================================================
   4. Scroll reveal — one observer, fires once, no-op under reduced motion
   ====================================================================== */
(function reveal() {
  var els = [].slice.call(document.querySelectorAll('.rev'));
  if (RM.matches || !('IntersectionObserver' in window)) {
    els.forEach(function (e) { e.classList.add('in'); });
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    });
  }, { threshold: 0.15 });
  els.forEach(function (e) { io.observe(e); });
})();

/* The play/ probe that used to live here is gone: the site ships no browser
   build at all now (native apps only), so there is nothing to detect. */

})();
