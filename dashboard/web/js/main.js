/* App shell: one tab bar (ARIA tabs, arrow keys, hash deep links, last tab remembered). */
import { renderTab, isTeamTab, initTeam } from "/js/team.js";
import { show as showToken } from "/js/dash.js";

document.documentElement.classList.add("js");
const tabs = [...document.querySelectorAll('[role="tab"]')];
const panels = tabs.map(t => document.getElementById(t.getAttribute("aria-controls")));
const KEY = "team-app:tab";
const save = id => { try { localStorage.setItem(KEY, id); } catch (e) {} };
const load = () => { try { return localStorage.getItem(KEY); } catch (e) { return null; } };

function activate(panel, target) {
  if (isTeamTab(panel.id)) return renderTab(panel);
  if (panel.id === "token") showToken(target);
  return Promise.resolve();
}

function select(i, { focus = false, hash = true, target = null } = {}) {
  tabs.forEach((t, j) => {
    const on = j === i;
    t.setAttribute("aria-selected", String(on));
    t.tabIndex = on ? 0 : -1;
    panels[j].hidden = !on;
  });
  if (focus) tabs[i].focus();
  tabs[i].scrollIntoView({ block: "nearest", inline: "nearest" });
  save(panels[i].id);
  if (hash && location.hash !== "#" + panels[i].id) history.replaceState(null, "", "#" + panels[i].id);
  return activate(panels[i], target);
}

/* #tab-id opens the tab; #heading-id opens the owning tab (rendered on demand) and scrolls. */
async function fromHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  if (!id) return false;
  let el = document.getElementById(id);
  let i = el ? panels.findIndex(p => p === el || p.contains(el)) : -1;
  if (i < 0) {  // a heading inside a team tab that is not rendered yet: render them, then look again
    for (const p of panels) if (isTeamTab(p.id)) await renderTab(p);
    el = document.getElementById(id);
    i = el ? panels.findIndex(p => p === el || p.contains(el)) : -1;
  }
  if (i < 0) return false;
  await select(i, { hash: false, target: el });
  if (el === panels[i]) window.scrollTo(0, 0); else el.scrollIntoView();
  return true;
}

tabs.forEach((t, i) => {
  t.addEventListener("click", () => { select(i); window.scrollTo(0, 0); });
  t.addEventListener("keydown", e => {
    const last = tabs.length - 1;
    const next = { ArrowRight: i === last ? 0 : i + 1, ArrowLeft: i === 0 ? last : i - 1, Home: 0, End: last }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    select(next, { focus: true });
  });
});

document.querySelector(".brand")?.addEventListener("click", e => {
  e.preventDefault();
  select(0);
  window.scrollTo(0, 0);
});

initTeam();
window.addEventListener("hashchange", fromHash);
fromHash().then(ok => {
  if (ok) return;
  const i = panels.findIndex(p => p.id === load());
  select(i < 0 ? 0 : i, { hash: false });
});
