/* App shell: opens the metrics page, wires hash deep links and the skill side panel. */
import { show as showToken } from "/js/dash.js";
import { initSheet } from "/js/sheet.js";

document.documentElement.classList.add("js");

/* #tk-* opens that view (also a heading inside it); any other hash, such as a removed doc tab, lands on the default view. */
function fromHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  const el = id ? document.getElementById(id) : null;
  if (el && el.closest(".dash-view")) {
    showToken(el);
    if (el.classList.contains("dash-view")) window.scrollTo(0, 0); else el.scrollIntoView();
  } else if (id) {
    showToken(document.getElementById("tk-tong-quan"));
    window.scrollTo(0, 0);
  } else {
    showToken(null);
  }
}

document.querySelector(".brand")?.addEventListener("click", e => {
  e.preventDefault();
  showToken(document.getElementById("tk-tong-quan"));
  window.scrollTo(0, 0);
});

initSheet();
window.addEventListener("hashchange", fromHash);
fromHash();
