/* Runs before first paint: marks the document as scripted and restores the saved theme, so a
 * reader who chose light does not get a frame of dark first. Small enough to be inline, kept in a
 * file so the pages that carry a Content-Security-Policy can use script-src 'self'. */
document.documentElement.classList.add('js');
try {
  var t = localStorage.getItem('theme-v3');
  if (t) document.documentElement.dataset.theme = t;
} catch (e) {}
