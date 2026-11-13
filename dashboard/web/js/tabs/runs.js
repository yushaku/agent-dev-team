import * as C from "../lib/charts.js";
import {
  $, esc, AG, AGENTS, zeroAg, COL, PARTS, GROUPS, ROLE_SRC, GATE, groupOf, roleCol,
  buildMixColours, mixCol, mixName, fmt, usd, pct, pad, dt, hm, dm, dur, median, sum,
  costCell, cut, r1, splitWhy, sessionsF, agentsF, buckets, bval, A, svg, fill, widthOf,
  fig, agentLegend, partLegend, groupLegend, scale, timeTicks, yAxis, vBars, hBars,
  arcPath, donut, squarify, spark, mixc, gantt, hideTip
} from "../lib/charts.js";

export function runInfo(S) {
  const d = C.state.data;
  const inRange = new Set(S.map(s => s.run_id).filter(Boolean));
  const runs = d.orca.runs.filter(r => (r.created >= d.range_start || inRange.has(r.id)) && (!C.state.repo || r.repo === C.state.repo)
    && (!C.state.wt || r.tasks.some(t => t.worktree === C.state.wt)) && (!C.state.role || r.tasks.some(t => t.role === C.state.role)));
  return runs.map(runDetail);
}
export function runDetail(r) {
  const head = t => (t.title.split(":")[0] || "").trim().toLowerCase();
  const fixes = r.tasks.filter(t => /^fix\b/.test(head(t))).sort((a, b) => (a.started || a.created) - (b.started || b.created));
  const fix = fixes.length, rer = r.tasks.filter(t => /^re-?review/.test(head(t))).length;
  const cnt = k => r.gates.filter(g => g.kind === k).length;
  const st = r.tasks.some(t => t.status === "failed") ? ["risk", "có task lỗi"] : r.tasks.some(t => t.status === "blocked") ? ["risk", "bị chặn"]
    : r.tasks.length && r.tasks.every(t => t.status === "completed") ? ["ok", "xong"] : ["warn", "đang chạy"];
  return { r, fixes, fix, rer, ap: cnt("approve"), ch: cnt("changes"), ot: cnt("other"), pe: cnt("pending"), st };
}
export function renderRuns(S) {
  const d = C.state.data;
  if (!d.orca.available) {
    C.state.run = "";
    $("#run-kpi").innerHTML = "";
    ["#c-runtok", "#c-gates"].forEach(id => fig(id, { title: id === "#c-runtok" ? "Token mỗi run" : "Cổng theo run", empty: "Chưa có dữ liệu Orca." }));
    $("#t-runs").innerHTML = "";
    $("#run-list").innerHTML = `<div class="callout warn" role="note"><p><span class="callout-label">Orca</span>${d.orca.available === false ? "Không gọi được lệnh <code>orca</code> (" + esc(d.orca.error || "") + "). Các tab khác vẫn đúng." : "Đang tải dữ liệu Orca ở nền, bấm Làm mới sau vài giây."}</p></div>`;
    return;
  }
  const info = runInfo(S), ags = agentsF();
  const tok = r => sum(ags, a => r.tokens[a] || 0);
  currentRun(info);
  const appr = info.filter(i => i.ap > 0);
  $("#run-kpi").innerHTML = `<article class="card"><h4>Run trong khoảng</h4><span class="big">${info.length}</span><span class="muted small">${appr.length} run có cổng duyệt</span></article>
    <article class="card"><h4>Token mỗi run được duyệt</h4><span class="big">${appr.length ? fmt(sum(appr, i => tok(i.r)) / appr.length) : "?"}</span><span class="muted small">trung bình trên ${appr.length} run</span></article>
    <article class="card"><h4>Vòng sửa</h4><span class="big">${sum(info, i => i.fix)}</span><span class="muted small">task fix, cùng ${sum(info, i => i.rer)} task re-review</span></article>
    <article class="card"><h4>Cổng</h4><span class="big">${sum(info, i => i.ap)} duyệt</span><span class="muted small">${sum(info, i => i.ch)} yêu cầu sửa, ${sum(info, i => i.pe)} đang chờ</span></article>`;
  const label = i => i.r.objective;
  let W = widthOf("#c-runtok");
  fig("#c-runtok", { title: "Token mỗi run", body: info.length ? hBars({ W, LW: 320, selected: C.state.run, rows: info.map(i => ({ label: label(i), full: i.r.objective + " (" + i.r.repo + ")", run: i.r.id, segs: ags.map(a => ({ v: i.r.tokens[a] || 0, color: COL[a], name: AG[a], f: "agent:" + a })), tip: [i.r.tokens.sessions + " phiên nối được", i.st[1]] })), fx: fmt, fv: v => fmt(v), xTitle: "Token", aria: "Thanh chồng token mỗi run theo agent" }) : "", legend: agentLegend(), caption: "Bấm tên run để xem dòng thời gian của run đó; bấm một màu để lọc agent." });
  W = widthOf("#c-gates");
  const GK = ["approve", "changes", "other", "pending"];
  const fixCol = "var(--red)";
  fig("#c-gates", { title: "Cổng và vòng sửa theo run", body: info.length ? hBars({ W, LW: 320, selected: C.state.run, rows: info.map(i => ({ label: label(i), full: i.r.objective, run: i.r.id,
      segs: GK.map(k => ({ v: i[{ approve: "ap", changes: "ch", other: "ot", pending: "pe" }[k]], color: GATE[k][1], name: "Cổng " + GATE[k][0].toLowerCase() })).concat([{ v: i.fix, color: fixCol, name: "Vòng sửa (task fix)" }]),
      right: [{ t: i.r.gates.length + " cổng" }].concat(i.fix ? [{ t: i.fix + " sửa", color: "var(--red)" }] : []) })), fx: v => String(Math.round(v * 10) / 10), fv: v => String(v), xTitle: "Số cổng và task fix", aria: "Thanh chồng kết quả cổng theo run" }) : "",
    legend: GK.map(k => ({ name: "Cổng " + GATE[k][0].toLowerCase(), color: GATE[k][1] })).concat([{ name: "Vòng sửa", color: fixCol }]), caption: "Mỗi ô là một cổng hoặc một task fix. Run nhiều đỏ là run phải sửa nhiều vòng. Bấm tên run để xem dòng thời gian." });
  $("#t-runs").innerHTML = info.length ? `<table><thead><tr><th>Run</th><th>Repo</th><th>Tạo lúc</th><th>Trạng thái</th><th class="num">Task</th><th class="num">Fix / re-review</th><th>Cổng</th><th class="num">Token</th></tr></thead><tbody>${info.map(i => `<tr><td><a href="#run-list" data-run="${esc(i.r.id)}">${esc(i.r.objective)}</a></td><td>${esc(i.r.repo)}</td><td class="nowrap">${dt(i.r.created)}</td><td><span class="chip ${i.st[0]}">${i.st[1]}</span></td><td class="num">${i.r.tasks.filter(t => t.status === "completed").length}/${i.r.tasks.length}</td><td class="num">${i.fix} / ${i.rer}</td><td class="nowrap">${i.ap ? `<span class="chip ok">${i.ap} duyệt</span> ` : ""}${i.ch ? `<span class="chip warn">${i.ch} sửa</span>` : ""}${!i.ap && !i.ch ? '<span class="muted">chưa có</span>' : ""}</td><td class="num">${fmt(tok(i.r))}</td></tr>`).join("")}</tbody></table>` : '<p class="muted">Không có run nào.</p>';
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
  $(container).innerHTML = `<figure class="chart" id="${esc(id)}"></figure>`;
  gantt(i, ttok, role, "#" + id);
}
export function markRunSelection() {
  document.querySelectorAll("#c-runtok svg [data-run], #c-gates svg [data-run]").forEach(el => el.setAttribute("aria-pressed", String(el.dataset.run === C.state.run)));
}

/* ---------- Phiên ---------- */
