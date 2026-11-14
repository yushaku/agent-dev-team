import * as C from "../lib/charts.js";
import {
  $, esc, AG, AGENTS, zeroAg, COL, PARTS, GROUPS, ROLE_SRC, GATE, groupOf, roleCol,
  buildMixColours, mixCol, mixName, fmt, pct, pad, dt, hm, dm, dur, median, sum,
  cut, r1, splitWhy, sessionsF, agentsF, buckets, bval, A, svg, fill, widthOf,
  fig, agentLegend, partLegend, groupLegend, scale, timeTicks, yAxis, vBars, hBars,
  arcPath, donut, squarify, spark, mixc, gantt, hideTip
} from "../lib/charts.js";

function renderRtk() {
  const d = C.state.data.rtk, kpi = $("#c-rtk-kpi");
  if (!d || !d.available) {
    kpi.innerHTML = '<p class="muted">RTK chưa có dữ liệu. Cài RTK rồi chạy vài lệnh để xem thống kê.</p>';
    ["#c-rtk-daily", "#c-rtk-cmd", "#c-rtk-project"].forEach(id => fig(id, { title: "", body: "", empty: "Không có dữ liệu." }));
    return;
  }
  const s = d.summary;
  const tiles = [
    ["Token tiết kiệm", fmt(s.saved), s.pct + "% tiết kiệm", "var(--green)"],
    ["Tổng lệnh", fmt(s.commands), "lệnh đã nén", "var(--sky)"],
    ["Input token", fmt(s.input), "token gốc đưa vào", "var(--blue)"],
    ["Output token", fmt(s.output), "token trả về", "var(--lavender)"],
  ];
  kpi.innerHTML = tiles.map(([h, big, sub, c]) => `<article class="card tile"><h4>${esc(h)}</h4><span class="big">${esc(big)}</span><span class="muted small">${esc(sub)}</span></article>`).join("");
  const daily = d.daily || [];
  const W = widthOf("#c-rtk-daily");
  fig("#c-rtk-daily", { title: "Token tiết kiệm theo ngày", body: daily.length ? vBars({ W, cats: daily.map(x => ({ label: x.date.slice(8) + "/" + x.date.slice(5, 7) })), series: [{ name: "Tiết kiệm", color: "var(--green)" }], get: (i, j) => daily[i].saved, fv: v => fmt(v) + " token", yTitle: "Token", xTitle: "Ngày", aria: "Cột token tiết kiệm theo ngày" }) : "", legend: [{ name: "Token tiết kiệm", color: "var(--green)" }], caption: "Tổng token tiết kiệm mỗi ngày." });
  const byCmd = d.by_cmd || [];
  const W2 = widthOf("#c-rtk-cmd");
  fig("#c-rtk-cmd", { title: "Theo lệnh", body: byCmd.length ? hBars({ W: W2, LW: 240, rowH: 24, rows: byCmd.map(x => ({ label: x.cmd, full: x.cmd, segs: [{ v: x.saved, color: "var(--green)", name: "Tiết kiệm" }], right: [{ t: fmt(x.saved) }, { t: x.pct + "%", color: "var(--subtext0)" }], tip: [x.cmd, x.n + " lệnh", "Tiết kiệm " + fmt(x.saved) + " (" + x.pct + "%)"] })), xTitle: "Token tiết kiệm", aria: "Thanh ngang token tiết kiệm theo lệnh" }) : "", caption: "15 lệnh tiết kiệm nhiều nhất." });
  const byProject = d.by_project || [];
  const W3 = widthOf("#c-rtk-project");
  fig("#c-rtk-project", { title: "Theo dự án", body: byProject.length ? hBars({ W: W3, LW: 240, rowH: 24, rows: byProject.map(x => ({ label: x.project, full: x.project, segs: [{ v: x.saved, color: "var(--green)", name: "Tiết kiệm" }], right: [{ t: fmt(x.saved) }, { t: x.pct + "%", color: "var(--subtext0)" }], tip: [x.project, x.n + " lệnh", "Tiết kiệm " + fmt(x.saved) + " (" + x.pct + "%)"] })), xTitle: "Token tiết kiệm", aria: "Thanh ngang token tiết kiệm theo dự án" }) : "", caption: "15 dự án tiết kiệm nhiều nhất." });
}

export function renderTokens() { renderRtk(); }
