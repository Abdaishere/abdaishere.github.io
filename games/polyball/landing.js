/* PolyBall landing. Old board deep links (#mode=1&sides=7) belong to the leaderboard page now. */
if (/mode=\d/.test(location.hash)) location.replace('leaderboard/' + location.hash);

/* leaderboard teaser: live top three, Classic on five sides */
(function () {
  var ol = document.getElementById('cupTop');
  function note(t) { var li = document.createElement('li'); li.className = 'small'; li.textContent = t; ol.appendChild(li); }
  PB.fetchBoard(0, 5).then(function (rows) {
    ol.textContent = '';
    if (!rows.length) note('Nobody has posted a run here yet. It could be you.');
    rows.slice(0, 3).forEach(function (r, i) { ol.appendChild(PB.card(r, i + 1)); });
  }).catch(function () {
    ol.textContent = ''; note('The leaderboard is taking a break. Try again in a moment.');
  }).then(function () { ol.removeAttribute('aria-busy'); });
})();

/* trailer: click to load, so no request goes to YouTube until asked */
document.getElementById('trailerBtn').addEventListener('click', function () {
  var f = document.createElement('iframe');
  f.src = 'https://www.youtube-nocookie.com/embed/0A4oTiEH7Co?autoplay=1'; f.allow = 'autoplay; fullscreen'; f.title = 'PolyBall trailer';
  f.style.cssText = 'width:100%;aspect-ratio:16/9;border:0;border-radius:20px;display:block'; this.replaceWith(f);
});

/* HERO RING: the hook in five seconds. Each clean catch plays a note you caused.
   ponytail: a 70-line stand-in for the game's ring. Port app.js's faithful ring
   (git history, same easing and rest angle) if the difference ever shows. */
(function () {
  var COL = ['#4BD86B', '#3FD0E0', '#F45CD0', '#FFD23F', '#FF5A5A'], N = 5, R = 130, NS = 'http://www.w3.org/2000/svg';
  var g = document.getElementById('ringG'), ball = document.getElementById('ball'), stage = document.getElementById('stage');
  var comboEl = document.getElementById('combo'), hint = document.getElementById('hint'), L = [1, 2, 3].map(function (i) { return document.getElementById('l' + i); });
  for (var i = 0; i < N; i++) {                       // edge 0 is the flat top edge at rest
    var a0 = (-126 + i * 72) * Math.PI / 180, a1 = (-54 + i * 72) * Math.PI / 180, l = document.createElementNS(NS, 'line');
    l.setAttribute('x1', R * Math.cos(a0)); l.setAttribute('y1', R * Math.sin(a0)); l.setAttribute('x2', R * Math.cos(a1)); l.setAttribute('y2', R * Math.sin(a1));
    l.setAttribute('stroke', COL[i]); l.setAttribute('stroke-width', 13); l.setAttribute('stroke-linecap', 'round'); g.appendChild(l);
  }
  var step = 0, combo = 0, colour = 0, y = -210, playing = true, touched = false, last = 0, ac = null;
  var TOP = 10 - R * Math.cos(Math.PI / 5) - 20, SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
  function topEdge() { return ((-step % N) + N) % N; }
  function spin(d) { step += d; g.style.transform = 'rotate(' + step * 72 + 'deg)'; }
  function tone(semi, type, vol, len) {
    if (!ac) return; var o = ac.createOscillator(), v = ac.createGain();
    o.type = type; o.frequency.value = 261.63 * Math.pow(2, semi / 12); v.gain.setValueAtTime(vol, ac.currentTime); v.gain.exponentialRampToValueAtTime(.001, ac.currentTime + len);
    o.connect(v).connect(ac.destination); o.start(); o.stop(ac.currentTime + len);
  }
  function newBall() { colour = Math.floor(Math.random() * N); ball.setAttribute('fill', COL[colour]); y = -210; }
  function land() {
    if (topEdge() === colour) {
      combo++; var n = SCALE[(combo - 1) % SCALE.length];
      tone(n + 12, 'triangle', .22, .5); if (combo >= 4) tone(n - 12, 'sine', .25, .7); if (combo >= 8) tone(n + 19, 'sine', .1, .9);
      hint.textContent = combo === 1 ? 'That note was you. Keep going.' : combo === 4 ? 'The bass just joined in.' : combo === 8 ? 'Now the harmony. You are the band.' : hint.textContent;
    } else { if (combo) { tone(-10, 'sawtooth', .12, .35); hint.textContent = 'Missed. In the real game, that ends the run.'; } combo = 0; }
    comboEl.textContent = combo; L[0].className = combo >= 1 ? 'on' : ''; L[1].className = combo >= 4 ? 'on' : ''; L[2].className = combo >= 8 ? 'on' : '';
    newBall();
  }
  function frame(t) {
    var dt = Math.min(.05, (t - last) / 1000); last = t;
    if (playing) {
      if (!touched && y > TOP - 90 && topEdge() !== colour) spin(1);          // gentle autopilot until the visitor takes over
      y += dt * 190; if (y >= TOP) land(); ball.setAttribute('cy', y);
    }
    requestAnimationFrame(frame);
  }
  function act(d) { touched = true; if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (ac && ac.state === 'suspended') ac.resume(); spin(d); }
  stage.addEventListener('pointerdown', function (e) { if (e.target.closest('.pause')) return; var r = stage.getBoundingClientRect(); act(e.clientX < r.left + r.width / 2 ? -1 : 1); });
  stage.addEventListener('keydown', function (e) { if (e.key === 'ArrowLeft') act(-1); else if (e.key === 'ArrowRight') act(1); });
  var paused = matchMedia('(prefers-reduced-motion: reduce)').matches, visible = true;
  function sync() { playing = visible && !paused; document.getElementById('pause').setAttribute('aria-label', paused ? 'Start the demo' : 'Pause the demo'); }
  document.getElementById('pause').addEventListener('click', function () { paused = !paused; sync(); });
  if (paused) hint.textContent = 'Press the round button to start the demo.';
  new IntersectionObserver(function (en) { visible = en[0].isIntersecting; sync(); }, { threshold: 0 }).observe(stage);   // pause offscreen
  sync();
  newBall(); requestAnimationFrame(frame);
})();
