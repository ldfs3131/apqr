/* Aplica o tema salvo antes da primeira pintura (evita o "piscar" de cor). Mantenha em sincronia com src/lib/theme.js. */
(function () {
  try {
    var p = localStorage.getItem('apqr.theme') || 'classic';
    var dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var t = p === 'auto' ? (dark ? 'dark' : 'classic') : (p === 'classic' || p === 'light' || p === 'dark' ? p : 'classic');
    document.documentElement.setAttribute('data-theme', t);
  } catch (e) { document.documentElement.setAttribute('data-theme', 'classic'); }
})();
