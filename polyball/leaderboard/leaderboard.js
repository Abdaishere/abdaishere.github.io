/* Leaderboard page: live board per mode and side count. Deep link: #mode=1&sides=7
   (same hash the old landing used, so shared links keep working). */
(function () {
  'use strict';
  var podium = document.getElementById('podium'), list = document.getElementById('list'),
      status = document.getElementById('status'), sidesSel = document.getElementById('sides'),
      chips = [].slice.call(document.querySelectorAll('[data-mode]'));
  var m = /mode=(\d)/.exec(location.hash), s = /sides=(\d+)/.exec(location.hash);
  var state = { mode: m && +m[1] <= 2 ? +m[1] : 0, sides: s && +s[1] >= 3 && +s[1] <= 63 && +s[1] % 2 ? +s[1] : 5 };
  var seq = 0;

  for (var v = 3; v <= 63; v += 2) {
    var o = document.createElement('option'); o.value = v; o.textContent = v + ' sides'; sidesSel.appendChild(o);
  }

  function pod(row, rank) {
    var li = PB.card(row, rank);                       // reuse the card, then re-dress it as a podium tile
    var el = document.createElement('li'); el.className = 'pod n' + rank;
    var md = document.createElement('span'); md.className = 'medal'; md.textContent = rank; md.setAttribute('aria-label', 'Rank ' + rank);
    el.appendChild(md); el.appendChild(li.querySelector('.plate')); el.appendChild(li.querySelector('.score')); el.appendChild(li.querySelector('.plat'));
    return el;
  }
  function say(text, retry) {
    status.textContent = text;
    if (retry) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'chip retry'; b.textContent = 'Try again';
      b.addEventListener('click', load); status.appendChild(b);
    }
  }

  function load() {
    var my = ++seq, mode = PB.MODES[state.mode];
    chips.forEach(function (c) { c.setAttribute('aria-pressed', String(+c.dataset.mode === state.mode)); });
    sidesSel.value = state.sides;
    history.replaceState(null, '', '#mode=' + state.mode + '&sides=' + state.sides);
    podium.setAttribute('aria-busy', 'true'); say('Loading the ' + mode + ' board…');
    PB.fetchBoard(state.mode, state.sides).then(function (rows) {
      if (my !== seq) return;                          // a newer pick won the race
      podium.textContent = ''; list.textContent = '';
      if (!rows.length) {
        var e = document.createElement('li'); e.className = 'empty';
        e.textContent = 'Nobody has posted a ' + mode + ' run on ' + state.sides + ' sides yet. It could be you.';
        list.appendChild(e); say(''); return;
      }
      rows.slice(0, 3).forEach(function (r, i) { podium.appendChild(pod(r, i + 1)); });
      rows.slice(3).forEach(function (r, i) { list.appendChild(PB.card(r, i + 4)); });
      say(rows.length === 1 ? 'One run so far. Room at the top.' : 'Top ' + rows.length + ' ' + mode + ' runs on ' + state.sides + ' sides.');
    }).catch(function () {
      if (my !== seq) return;
      podium.textContent = ''; list.textContent = '';
      say('The leaderboard is taking a break. Check your connection and try again.', true);
    }).then(function () { if (my === seq) podium.removeAttribute('aria-busy'); });
  }

  chips.forEach(function (c) { c.addEventListener('click', function () { state.mode = +c.dataset.mode; load(); }); });
  sidesSel.addEventListener('change', function () { state.sides = +sidesSel.value; load(); });
  load();
})();
