import * as C from "../lib/charts.js";
import { $, esc, sessionsF, agentsF, sum, gantt, tokenTimeline } from "../lib/charts.js";

export function runInfo(S) {
  const d = C.state.data;
  const inRange = new Set(S.map(s => s.run_id).filter(Boolean));
  const runs = d.orca.runs.filter(r => (r.created >= d.range_start || inRange.has(r.id)) && (!C.state.repo || r.repo === C.state.repo)
    && (!C.state.runF || r.id === C.state.runF)
    && (!C.state.wt || r.tasks.some(t => t.worktree === C.state.wt)) && (!C.state.role || r.tasks.some(t => t.role === C.state.role)));
  return runs.map(runDetail);
}
export function runDetail(r) {
  const fixes = r.tasks.filter(t => t.measurement?.kind === "fix").sort((a, b) => (a.started || a.created) - (b.started || b.created));
  const fix = fixes.length, rer = r.tasks.filter(t => t.measurement?.kind === "re-review").length;
  const rounds = new Set(r.tasks.filter(t => ["fix", "re-review"].includes(t.measurement?.kind) && t.measurement.round).map(t => t.measurement.round)).size;
  const unknownRounds = r.tasks.filter(t => ["fix", "re-review"].includes(t.measurement?.kind) && !t.measurement.round).length;
  const estimated = r.tasks.filter(t => t.measurement?.source !== "metadata").length;
  const cnt = k => r.gates.filter(g => g.kind === k).length;
  const st = { failed: ["risk", "có Task lỗi"], blocked: ["risk", "bị chặn"], in_progress: ["warn", "đang làm"],
    awaiting_approval: ["warn", "chờ PO duyệt"], awaiting_delivery: ["warn", "chờ duyệt delivery"],
    delivered: ["ok", "đã giao"], merged: ["ok", "đã merge"], cancelled: ["neutral", "đã hủy"] }[r.stage] || ["neutral", "chưa rõ delivery"];
  return { r, fixes, fix, rer, rounds, unknownRounds, estimated, ap: cnt("approve"), ch: cnt("changes"), ot: cnt("other"), pe: cnt("pending"), st };
}
export function renderRuns(S) {
  const d = C.state.data;
  $("#run-data-warning").hidden = !d.orca.error;
  $("#run-data-warning").textContent = d.orca.error || "";
  if (!d.orca.available) {
    C.state.run = "";
    $("#run-picker").innerHTML = "";
    $("#run-picker").disabled = true;
    $("#run-list").innerHTML = `<div class="callout warn" role="note"><p><span class="callout-label">Orca</span>${d.orca.available === false ? "Không gọi được lệnh <code>orca</code> (" + esc(d.orca.error || "") + "). Các tab khác vẫn đúng." : "Đang tải dữ liệu Orca ở nền, bấm Làm mới sau vài giây."}</p></div>`;
    return;
  }
  const info = runInfo(S);
  currentRun(info);
  $("#run-picker").disabled = !info.length;
  $("#run-picker").innerHTML = [...info].sort((a, b) => b.r.created - a.r.created).map(i => `<option value="${esc(i.r.id)}">${esc(i.r.repo + " · " + i.r.objective + " · " + i.st[1])}</option>`).join("");
  $("#run-picker").value = C.state.run;
  renderRunTimeline(info);
}
function currentRun(info) {
  const selected = info.find(i => i.r.id === C.state.run) || info.reduce((latest, i) => !latest || i.r.created > latest.r.created ? i : latest, null);
  C.state.run = selected ? selected.r.id : "";
  return selected;
}
export function renderRunTimeline(info, selectedId, role = C.state.role, container = "#run-list", prefix = "g-") {
  const i = selectedId === undefined ? currentRun(info)
    : info.find(x => x.r.id === selectedId) || info.reduce((latest, x) => !latest || x.r.created > latest.r.created ? x : latest, null);
  if (!i) { $(container).innerHTML = '<p class="muted">Không có run nào trong khoảng này.</p>'; return; }
  const ags = agentsF(), ttok = t => sum(ags, a => t.tokens[a] || 0);
  const id = prefix + i.r.id;
  $(container).innerHTML = `<figure class="chart" id="${esc(id)}"></figure><figure class="chart" id="${esc(prefix + "tok-" + i.r.id)}"></figure>`;
  gantt(i, ttok, role, "#" + id);
  tokenTimeline(i, ttok, role, "#" + prefix + "tok-" + i.r.id);
}
$("#run-picker").addEventListener("change", e => {
  C.state.run = e.target.value;
  renderRunTimeline(runInfo(sessionsF()));
});
