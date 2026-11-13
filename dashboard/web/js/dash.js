import * as C from "./lib/charts.js";
import {
  $, esc, AG, buildMixColours, sessionsF, agentsF, buckets, splitWhy, fmt, hm, persist, hideTip
} from "./lib/charts.js";
import { renderOverview } from "./tabs/overview.js";
import { renderRoles } from "./tabs/roles.js";
import { renderRepos } from "./tabs/repos.js";
import { renderRuns, runInfo, renderRunTimeline, markRunSelection } from "./tabs/runs.js";
import { renderSessions, showSession } from "./tabs/sessions.js";
import { renderSkills } from "./tabs/skills.js";
import { renderTokens } from "./tabs/tokens.js";
import { renderOverall } from "./tabs/overall.js";

async function load() {
  C.state.loading = true; setAuto();
  try {
    const r = await fetch("/api/data?days=" + C.state.days, { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    C.state.data = await r.json();
    C.state.err = "";
  } catch (e) {
    C.state.err = e.message;
    C.state.errKind = "fetch";
  }
  if (!C.state.err) {
    try {
      C.state.data.sessions.forEach(s => { s.split = splitWhy(s); });
      render();
    } catch (e) {
      C.state.err = e.message;
      C.state.errKind = "render";
      console.error("Dashboard render failed:", e);
    }
  }
  C.state.loading = false; setAuto();
}

function render() {
  const d = C.state.data;
  buildMixColours();
  const repos = [...new Set(d.sessions.map(s => s.repo).concat((d.orca.runs || []).map(r => r.repo)))].filter(Boolean).sort();
  const sel = $("#f-repo");
  sel.innerHTML = '<option value="">Mọi repo</option>' + repos.map(r => `<option${r === C.state.repo ? " selected" : ""}>${esc(r)}</option>`).join("");
  $("#f-agent").value = C.state.agent;
  $("#range").value = String(C.state.days);
  renderRunFilter(d);
  renderFilterBar();
  const S = sessionsF();
  renderOverall(S); renderOverview(S); renderRoles(S); renderRepos(S); renderRuns(S); renderSessions(S); renderSkills(S); renderTokens();
}

/* ---------- cross filter ---------- */
const FLABEL = { agent: "Agent", repo: "Repo", wt: "Worktree", role: "Vai", runF: "Run", taskF: "Task" };
/* Run and Task selects list runs that have sessions under the repo and agent filters. */
function renderRunFilter(d) {
  const ids = new Set(d.sessions.filter(s => (!C.state.repo || s.repo === C.state.repo) && (!C.state.agent || s.agent === C.state.agent)).map(s => s.run_id).filter(Boolean));
  const runs = (d.orca.runs || []).filter(r => ids.has(r.id)).sort((a, b) => b.created - a.created);
  const run = runs.find(r => r.id === C.state.runF);
  if (!run) C.state.runF = "";
  const tasks = run ? run.tasks.filter(t => t.id) : [];
  if (!tasks.some(t => t.id === C.state.taskF)) C.state.taskF = "";
  $("#f-run").innerHTML = '<option value="">Mọi run</option>' + runs.map(r => `<option value="${esc(r.id)}">${esc(r.objective || r.id)}</option>`).join("");
  $("#f-run").value = C.state.runF;
  $("#f-task").disabled = !run;
  $("#f-task").innerHTML = '<option value="">Mọi task</option>' + tasks.map(t => `<option value="${esc(t.id)}">${esc(t.title || t.id)}</option>`).join("");
  $("#f-task").value = C.state.taskF;
}
function filterText(k) {
  const v = C.state[k], runs = (C.state.data && C.state.data.orca.runs) || [], run = runs.find(r => r.id === C.state.runF);
  if (k === "agent") return AG[v];
  if (k === "runF") return run ? run.objective || v : v;
  if (k === "taskF") { const t = run && run.tasks.find(t => t.id === v); return t ? t.title || v : v; }
  return v;
}
function applyFilter(spec) {
  const i = spec.indexOf(":"), k = spec.slice(0, i), v = spec.slice(i + 1);
  if (k === "task") {
    const j = v.indexOf("/");
    C.state.runF = v.slice(0, j); C.state.taskF = v.slice(j + 1);
  } else if (k === "wt") {
    const j = v.indexOf("/"), repo = v.slice(0, j), wt = v.slice(j + 1);
    if (C.state.repo === repo && C.state.wt === wt) C.state.wt = ""; else { C.state.repo = repo; C.state.wt = wt; }
  } else if (k in FLABEL) {
    C.state[k] = C.state[k] === v ? "" : v;
    if (k === "repo") C.state.wt = "";
  } else return;
  persist(); render();
}
function clearFilter(k) {
  if (k === "all") { C.state.repo = C.state.agent = C.state.role = C.state.wt = C.state.runF = C.state.taskF = ""; }
  else { C.state[k] = ""; if (k === "repo") C.state.wt = ""; if (k === "runF") C.state.taskF = ""; }
  persist(); render();
}
function renderFilterBar() {
  const on = ["agent", "repo", "wt", "role", "runF", "taskF"].filter(k => C.state[k]);
  const fb = $("#fbar");
  fb.hidden = !on.length;
  fb.innerHTML = on.length ? `<span>Đang lọc:</span>${on.map(k => `<button class="chip info" data-clear="${k}" aria-label="Bỏ lọc ${FLABEL[k]} ${esc(filterText(k))}">${FLABEL[k]}: ${esc(filterText(k))}, bỏ lọc</button>`).join("")}${on.length > 1 ? '<button class="chip neutral" data-clear="all">Bỏ lọc tất cả</button>' : ""}` : "";
}


/* ---------- events ---------- */
$("#range").value = String(C.state.days);
$("#range").addEventListener("change", e => { C.state.days = +e.target.value; persist(); load(); });
$("#f-repo").addEventListener("change", e => { C.state.repo = e.target.value; C.state.wt = ""; persist(); render(); });
$("#f-agent").addEventListener("change", e => { C.state.agent = e.target.value; persist(); render(); });
$("#f-run").addEventListener("change", e => { C.state.runF = e.target.value; C.state.taskF = ""; persist(); render(); });
$("#f-task").addEventListener("change", e => { C.state.taskF = e.target.value; persist(); render(); });
$("#refresh").addEventListener("click", load);
$("#tk-split").addEventListener("click", () => { C.state.split = !C.state.split; renderSessions(); });
$("#tk-q").addEventListener("input", e => { C.state.q = e.target.value; renderSessions(); });
/* Status text doubles as the auto-refresh toggle: "Cập nhật 09:52" or "Tự động · 09:52" with a green dot. */
function setAuto() {
  const btn = $("#auto"), dot = $("#auto .dot"), at = C.state.data ? hm(C.state.data.generated_at) : "";
  btn.setAttribute("aria-pressed", String(C.state.auto));
  dot.style.display = C.state.auto ? "inline-block" : "none";
  dot.style.background = C.state.err ? "var(--red)" : "var(--green)";
  $("#updated").textContent = C.state.loading ? "Đang tải" : C.state.err ? (C.state.errKind === "render" ? "Lỗi hiển thị" : "Lỗi tải dữ liệu") : (C.state.auto ? "Tự động · " : "Cập nhật ") + at;
  $("#updated").title = C.state.err || "";
  btn.title = (C.state.err ? "Lỗi: " + C.state.err + ". " : "") + (C.state.auto ? "Đang tự làm mới mỗi 60 giây. Bấm để tắt" : "Bấm để tự làm mới mỗi 60 giây");
  $("#refresh").disabled = !!C.state.loading;
}
function setTimer() {
  clearInterval(C.state.timer);
  if (C.state.auto) C.state.timer = setInterval(() => { if (!document.hidden && !$("#detail").open && !$("#token").hidden) load(); }, 60000);
}
$("#auto").addEventListener("click", () => { C.state.auto = !C.state.auto; persist(); setAuto(); setTimer(); });
function activate(el) {
  if (el.dataset.run && el.closest("#tk-runs")) {
    C.state.run = el.dataset.run;
    renderRunTimeline(runInfo(sessionsF()));
    markRunSelection();
    return;
  }
  if (el.dataset.clear) return clearFilter(el.dataset.clear);
  if (el.dataset.f) return applyFilter(el.dataset.f);
  if (el.dataset.run) { const t = document.getElementById("run-" + el.dataset.run); if (t) t.scrollIntoView(); return; }
  if (el.dataset.sid) return showSession(el.dataset.sid);
}
document.addEventListener("click", e => {
  const th = e.target.closest("th[data-key]");
  if (th) { const k = th.dataset.key; C.state.sort = { key: k, dir: C.state.sort.key === k ? -C.state.sort.dir : -1 }; renderSessions(); return; }
  const el = e.target.closest("[data-clear], [data-f], [data-run], [data-sid]");
  if (el) { hideTip(); if (el.dataset.run && el.closest("#tk-runs")) e.preventDefault(); activate(el); }
});
document.addEventListener("keydown", e => {
  const el = e.target.closest && e.target.closest("[data-f], [data-run], [data-sid]");
  if (el && (e.key === "Enter" || (e.key === " " && el.tagName !== "BUTTON"))) { e.preventDefault(); activate(el); }
});
let resizeTimer = null, lastW = window.innerWidth;
window.addEventListener("resize", () => { if (window.innerWidth === lastW) return; lastW = window.innerWidth; clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (C.state.data) render(); }, 150); });
$("#detail-close").addEventListener("click", () => $("#detail").close());
document.addEventListener("visibilitychange", () => { if (!document.hidden && !$("#token").hidden && C.state.auto && C.state.data && Date.now() / 1000 - C.state.data.generated_at > 60) load(); });

/* Sub-views inside the Token tab: hidden views measure 0 px wide, so redraw at the real width when one opens. */
const views = [...document.querySelectorAll(".dash-view")];
const viewBtns = [...document.querySelectorAll("#tk-nav [data-view]")];
const VKEY = "team-app:token-view";
export function showView(id, { hash = true } = {}) {
  if (id === "tk-toan-dien") id = "tk-theo-repo";
  if (!views.some(v => v.id === id)) id = views[0].id;
  views.forEach(v => { v.hidden = v.id !== id; });
  viewBtns.forEach(b => { const on = b.dataset.view === id; if (b.tagName === "A") { if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); } else b.setAttribute("aria-pressed", String(on)); });
  try { localStorage.setItem(VKEY, id); } catch (e) {}
  if (hash && location.hash !== "#" + id) history.replaceState(null, "", "#" + id);
  if (C.state.data) render();
}
viewBtns.forEach(b => b.addEventListener("click", e => { e.preventDefault(); showView(b.dataset.view); }));
let started = false;
/* Called when the Token tab opens; el is the hash target inside it, if any. */
export function show(el) {
  const v = el && el.closest && el.closest(".dash-view");
  let id = v ? v.id : null;
  if (!id) { try { id = localStorage.getItem(VKEY); } catch (e) {} }
  showView(id || views[0].id, { hash: !!v || false });
  if (!started) { started = true; setTimer(); load(); }
  else if (C.state.auto && C.state.data && Date.now() / 1000 - C.state.data.generated_at > 60) load();
}
