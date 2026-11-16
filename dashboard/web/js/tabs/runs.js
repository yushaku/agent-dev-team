import * as C from "../lib/charts.js";
import { $, esc, agentsF, sum, gantt, tokenTimeline } from "../lib/charts.js";

/* Run timeline helpers shared with the Theo repo / task view (overall.js). */
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
export function renderRunTimeline(info, selectedId, role = C.state.role, container, prefix) {
  const i = info.find(x => x.r.id === selectedId) || info.reduce((latest, x) => !latest || x.r.created > latest.r.created ? x : latest, null);
  if (!i) { $(container).innerHTML = '<p class="muted">Không có run nào trong khoảng này.</p>'; return; }
  const ags = agentsF(), ttok = t => sum(ags, a => t.tokens[a] || 0);
  const id = prefix + i.r.id;
  $(container).innerHTML = `<figure class="chart" id="${esc(id)}"></figure><figure class="chart" id="${esc(prefix + "tok-" + i.r.id)}"></figure>`;
  gantt(i, ttok, role, "#" + id);
  tokenTimeline(i, ttok, role, "#" + prefix + "tok-" + i.r.id);
}
