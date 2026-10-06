/* Leaderboard page: live board per mode and side count. Deep link: #mode=1&sides=7
   (same hash the old landing used, so shared links keep working). */
(function () {
  'use strict';
  var podium = document.getElementById('podium'), list = document.getElementById('list'),
      status = document.getElementById('status'), note = document.getElementById('mode-note'), sidesSel = document.getElementById('sides'),
      chips = [].slice.call(document.querySelectorAll('[data-mode]')), champsSec = document.getElementById('champions');
  var m = /mode=(\d)/.exec(location.hash), s = /sides=(\d+)/.exec(location.hash);
  var state = { mode: m && PB.MODES[+m[1]] ? +m[1] : 0, sides: s && +s[1] >= 3 && +s[1] <= 63 && +s[1] % 2 ? +s[1] : 5 };
  /* one line per ranked mode, the same words as the landing page's mode cards */
  var NOTES = { 0: 'Endless, and it only gets faster.', 4: 'Classic, plus a new twist every ten catches.', 1: 'Balls land on the beat.', 2: 'Clean catches buy back seconds.' };
  var seq = 0, shown = false, live = null;   // shown = this board's rows are on screen; live = this month's cup
  /* The champions block appears in the same frame as the board's first result, never on its own:
     one layout change instead of two. And a #champions link cannot jump by itself (load() rewrites
     the hash, the block starts hidden), so it jumps here, once both are in place. */
  var toChamps = location.hash === '#champions', boardDone = false, cups = null;   // cups: null = pending, false = failed
  function reveal() {
    if (!boardDone || cups === null) return;
    document.getElementById('board').classList.remove('busy');   // the height reserve goes in the same frame
    champsSec.hidden = !cups;
    if (cups && toChamps) { toChamps = false; champsSec.scrollIntoView(); }
  }

  for (var v = 3; v <= 63; v += 2) {
    var o = document.createElement('option'); o.value = v; o.textContent = v + ' sides'; sidesSel.appendChild(o);
  }

  function pod(row, rank) {
    var li = PB.card(row, rank);                       // reuse the card, then re-dress it as a podium tile
    var el = document.createElement('li'); el.className = 'pod n' + rank;
    if (li.dataset.plate) el.dataset.plate = li.dataset.plate;   // the tile wears the player's plate too
    var md = document.createElement('span'); md.className = 'medal'; md.textContent = rank; md.setAttribute('aria-label', 'Rank ' + rank);
    el.appendChild(md); el.appendChild(li.querySelector('.plate')); el.appendChild(li.querySelector('.score')); el.appendChild(li.querySelector('.plat'));
    return el;
  }
  function openPod(rank) {                             // an empty place on a short board, drawn as an outline
    var el = document.createElement('li'); el.className = 'pod open n' + rank; el.setAttribute('aria-hidden', 'true');
    var md = document.createElement('span'); md.className = 'medal'; md.textContent = rank;
    var fr = document.createElement('span'); fr.className = 'free'; fr.textContent = 'Open';
    el.appendChild(md); el.appendChild(fr);
    return el;
  }
  /* On the cup's own board the caption says so, with the close time from the server, never the
     visitor's clock. Runs after whichever of the two reads lands second. */
  function cupCaption() {
    if (!shown || !live || PB.MODES[state.mode] !== live.mode || state.sides !== live.sides || status.querySelector('.cup')) return;
    var s = document.createElement('span'); s.className = 'cup';
    s.append((status.textContent ? ' ' : '') + 'This board is the ' + live.name + ', and it closes ', PB.closeTime(live.season), '.');
    status.appendChild(s);
  }
  function say(text, retry) {
    shown = false;
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
    note.textContent = NOTES[state.mode];
    history.replaceState(null, '', '#mode=' + state.mode + '&sides=' + state.sides);
    podium.setAttribute('aria-busy', 'true');
    /* first load: the note sits where the rows will land, so nothing gets pushed down (CLS);
       later picks keep the old rows up and say it in the caption instead */
    if (podium.children.length || list.children.length) say('Loading the ' + mode + ' board…');
    else { say(''); var w = document.createElement('li'); w.className = 'wait'; w.textContent = 'Loading the ' + mode + ' board…'; podium.appendChild(w); }
    PB.fetchBoard(state.mode, state.sides).then(function (rows) {
      if (my !== seq) return;                          // a newer pick won the race
      podium.textContent = ''; list.textContent = '';
      if (!rows.length) {
        var e = document.createElement('li'); e.className = 'empty';
        e.textContent = 'Nobody has posted a ' + mode + ' run on ' + state.sides + PB.NB + 'sides yet. The first one takes the top spot.';
        list.appendChild(e); say(''); shown = true; cupCaption(); return;
      }
      rows.slice(0, 3).forEach(function (r, i) { podium.appendChild(pod(r, i + 1)); });
      for (var k = rows.length + 1; k <= 3; k++) podium.appendChild(openPod(k));
      rows.slice(3).forEach(function (r, i) { list.appendChild(PB.card(r, i + 4)); });
      say(rows.length === 1 ? 'One run so far. Second and third are open.' : rows.length === 2 ? 'Two runs so far. Third is open.' : 'Top ' + rows.length + ' ' + mode + ' runs on ' + state.sides + PB.NB + 'sides.');
      shown = true; cupCaption();
    }).catch(function () {
      if (my !== seq) return;
      podium.textContent = ''; list.textContent = '';
      say('The leaderboard is taking a break. Check your connection and try again.', true);
    }).then(function () { if (my === seq) { podium.removeAttribute('aria-busy'); boardDone = true; reveal(); } });
  }

  chips.forEach(function (c) { c.addEventListener('click', function () { state.mode = +c.dataset.mode; load(); }); });
  sidesSel.addEventListener('change', function () { state.sides = +sidesSel.value; load(); });
  load();

  /* Champions: every FINAL cup's winner, newest first. Any failure leaves the section hidden. */
  PB.fetchCups().then(function (data) {
    var cur = data.seasons[0], ul = document.getElementById('champs'), note = PB.cupNote(data);
    if (!cur) { cups = false; reveal(); return; }      // no season rows at all: nothing true to say
    live = PB.cupOf(data, 'live'); cupCaption();
    document.getElementById('ch-rule').textContent = 'Each month, the best ' + cur.mode + ' run on ' + cur.sides + PB.NB + 'sides wins the cup.';
    data.champs.forEach(function (c) {
      var li = PB.card(c, 1, 'li'), when = document.createElement('time');
      li.classList.remove('first'); li.classList.add('champ');
      when.className = 'when'; when.dateTime = c.season.slice(0, 7); when.textContent = PB.monthOf(c.season);
      li.replaceChild(when, li.querySelector('.rank'));
      ul.appendChild(li);
    });
    ul.hidden = !data.champs.length;
    if (note) { var n = document.getElementById('ch-note'); n.append.apply(n, note); }
    cups = true; reveal();
  }).catch(function () { cups = false; reveal(); });
})();
