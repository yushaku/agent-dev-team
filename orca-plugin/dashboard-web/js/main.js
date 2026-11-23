/* App shell: opens the metrics page, wires hash deep links and the skill side panel. */
import { show as showToken } from "./dash.js";
import { initSheet } from "./sheet.js";

document.documentElement.classList.add("js");

/* Inside Orca's HTML panel the plugin boots the Tasks view instead (orca-panel.js: data from the worker, a status bar). */
if (window.orca) {
  document.documentElement.classList.add("orca");
  initSheet(); /* the skill side panel works here too: its fetch goes through the worker (orca-panel.js) */
  await import("./orca-panel.js");
} else {

  /* #tk-* opens that view (also a heading inside it); any other hash, such as a removed doc tab, lands on the default view. */
  function fromHash() {
    const id = ({ "tk-runs": "tk-theo-repo", "tk-dang-chay": "tk-theo-repo", "tk-phien": "tk-theo-repo",
      "tk-skills": "tk-agents-tools", "tk-search": "tk-agents-tools",
      "tk-skills-h": "tk-agents-tools-h", "tk-search-h": "tk-agents-tools-h" })[decodeURIComponent(location.hash.slice(1))] || decodeURIComponent(location.hash.slice(1));
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
}
