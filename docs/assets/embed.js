// Archify iframes: diagram-only mode (?embed=1) grown to the diagram's height.
// Needs same origin (GitHub Pages); under file:// the height attribute stays as the fallback.
(function () {
  function fit(f) {
    try {
      var d = f.contentDocument;
      if (d && d.body) f.style.height = d.body.scrollHeight + 'px';
    } catch (e) {}
  }
  document.querySelectorAll('.frame iframe').forEach(function (f) {
    f.addEventListener('load', function () { fit(f); setTimeout(function () { fit(f); }, 500); });
    fit(f);
  });
  var t;
  window.addEventListener('resize', function () {
    clearTimeout(t);
    t = setTimeout(function () { document.querySelectorAll('.frame iframe').forEach(fit); }, 200);
  });
})();
