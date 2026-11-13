// Theme: saved choice, else the system preference. Runs in <head> so the page does not flash.
(function () {
  var root = document.documentElement;
  var saved = null;
  try { saved = localStorage.getItem('theme'); } catch (e) {}
  var query = window.matchMedia('(prefers-color-scheme: light)');

  function label(theme) {
    var btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = theme === 'dark' ? 'Chế độ sáng (Light)' : 'Chế độ tối (Dark)';
  }
  function apply(theme) {
    root.setAttribute('data-theme', theme);
    label(theme);
  }

  apply(saved === 'light' || saved === 'dark' ? saved : (query.matches ? 'light' : 'dark'));

  query.addEventListener('change', function (e) {
    var stored = null;
    try { stored = localStorage.getItem('theme'); } catch (err) {}
    if (!stored) apply(e.matches ? 'light' : 'dark');
  });

  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('theme-toggle');
    label(root.getAttribute('data-theme'));
    btn.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('theme', next); } catch (e) {}
      apply(next);
    });
  });
})();
