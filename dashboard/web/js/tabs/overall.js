import * as C from "../lib/charts.js";
import { $, esc, AG, GROUPS, groupOf, roleCol, fmt, usd, median, sum, widthOf, fig, hBars } from "../lib/charts.js";
import { runDetail, renderRunTimeline } from "./runs.js";
import { sessionRow } from "./sessions.js";

const text = v => String(v == null ? "" : v).replace(/[–—]/g, "-");
const roleName = s => !s.role || s.role.toLowerCase() === "chat trực tiếp" ? "Chat trực tiếp" : text(s.role);

function renderSummary(S) {
  const tokens = sum(S, s => s.total), cost = sum(S, s => s.cost), unpriced = sum(S, s => s.unpriced);
  $("#overall-kpi").innerHTML = [
    ["Tổng token", fmt(tokens), `${fmt(sum(S, s => s.calls))} lượt gọi`],
    ["Chi phí ước tính", usd(cost), unpriced ? `${fmt(unpriced)} token chưa có giá` : "Theo prices.json"],
    ["Phiên hoạt động", String(S.length), `trung vị ${fmt(median(S.map(s => s.total)))} token mỗi phiên`],
  ].map(([title, value, note]) => `<article class="card tile"><h4>${title}</h4><span class="big">${value}</span><span class="muted small">${note}</span></article>`).join("");
}

function renderRoles(S) {
  const byRole = new Map();
  S.forEach(s => {
    const role = roleName(s), x = byRole.get(role) || { total: 0, raw: s.role || "" };
    x.total += s.total; byRole.set(role, x);
  });
  const rows = [...byRole].sort((a, b) => b[1].total - a[1].total).map(([role, { total, raw }]) => ({
    label: role, f: raw ? "role:" + raw : null, dot: roleCol(role.toLowerCase()),
    full: `${role} (${GROUPS[groupOf(role.toLowerCase())][0]})`,
    segs: [{ v: total, color: roleCol(role.toLowerCase()), name: role }],
    right: [{ t: fmt(total) }],
  }));
  const chart = $("#c-overall-role");
  chart.hidden = !rows.length;
  if (!rows.length) { chart.innerHTML = ""; return; }
  fig("#c-overall-role", {
    title: "Token theo vai",
    body: hBars({ W: widthOf("#c-overall-role"), LW: 150, RW: 70, rows, xTitle: "Token", aria: "Thanh ngang token theo vai" }),
    caption: "Mỗi thanh là tổng token của một vai. Bấm tên vai để lọc phiên.",
  });
}

function renderSessions(S, tasks) {
  const section = $("#overall-sessions-section"), target = $("#overall-sessions");
  section.hidden = !S.length;
  if (!S.length) { target.innerHTML = ""; return; }
  const taskNames = new Map(tasks.map(t => [t.id, t.title || t.id]));
  const cells = s => {
    const title = text(s.task_title || taskNames.get(s.task_id) || "");
    return [
      `<td class="nowrap">${s.start ? C.dt(s.start) : ""}</td>`,
      `<td>${esc(AG[s.agent] || "")}</td>`,
      `<td>${s.role ? `<button type="button" class="overall-link" data-f="role:${esc(s.role)}">${esc(roleName(s))}</button>` : esc(roleName(s))}</td>`,
      `<td>${title ? s.task_id ? `<button type="button" class="overall-link" data-f="task:${esc((s.run_id || "") + "/" + s.task_id)}">${esc(title)}</button>` : esc(title) : ""}</td>`,
      `<td class="num">${fmt(s.total)}</td>`,
    ].join("");
  };
  target.innerHTML = `<table><thead><tr><th>Bắt đầu</th><th>Agent</th><th>Vai</th><th>Task</th><th class="num">Token</th></tr></thead><tbody>${S.map(s => sessionRow(s, cells(s))).join("")}</tbody></table>`;
}

export function renderOverall(S) {
  const d = C.state.data;
  if (!d) return;
  const runs = d.orca.runs || [], ids = new Set(S.map(s => s.run_id).filter(Boolean));
  const run = runs.find(r => r.id === C.state.runF);
  renderSummary(S);
  renderRoles(S);
  renderSessions(S, run ? run.tasks : []);
  const timelineRun = run || runs.filter(r => ids.has(r.id)).sort((a, b) => b.created - a.created)[0];
  $("#overall-timeline").hidden = !timelineRun;
  if (timelineRun) {
    const r = { ...timelineRun, objective: text(timelineRun.objective), tasks: timelineRun.tasks.map(t => ({ ...t, title: text(t.title) })) };
    renderRunTimeline([runDetail(r)], r.id, "", "#overall-run-list", "overall-g-");
  }
}
