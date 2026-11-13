import * as C from "../lib/charts.js";
import {
  $, esc, AG, AGENTS, zeroAg, COL, PARTS, GROUPS, ROLE_SRC, GATE, groupOf, roleCol,
  buildMixColours, mixCol, mixName, fmt, usd, pct, pad, dt, hm, dm, dur, median, sum,
  costCell, cut, r1, splitWhy, sessionsF, agentsF, buckets, bval, A, svg, fill, widthOf,
  fig, agentLegend, partLegend, groupLegend, scale, timeTicks, yAxis, vBars, hBars,
  arcPath, donut, squarify, spark, mixc, gantt, hideTip
} from "../lib/charts.js";

export function renderSkills(S) {
  const by = {};
  S.forEach(s => {
    Object.entries(s.skills).forEach(([k, v]) => {
      const r = by[k] = by[k] || Object.assign(zeroAg(), { last: 0, sessions: 0 });
      r[s.agent] += v[0]; r.last = Math.max(r.last, v[1]); r.sessions++;
    });
    /* A hook-injected skill counts as one load per session, unless the agent also loaded it. */
    Object.keys(s.hooks || {}).forEach(k => {
      if (s.skills[k]) return;
      const r = by[k] = by[k] || Object.assign(zeroAg(), { last: 0, sessions: 0 });
      r[s.agent] += 1; r.last = Math.max(r.last, s.start || 0); r.sessions++;
    });
  });
  (C.state.data.skills_installed || []).forEach(k => { if (!by[k]) by[k] = Object.assign(zeroAg(), { last: 0, sessions: 0 }); });
  const rows = Object.entries(by).sort((a, b) => sum(AGENTS, x => b[1][x]) - sum(AGENTS, x => a[1][x])), ags = agentsF();
  const W = widthOf("#c-skills");
  fig("#c-skills", { title: "Số lần nạp mỗi skill", body: rows.length ? hBars({ W, LW: 240, rowH: 24, rows: rows.map(([k, r]) => ({ label: k, skill: k, segs: ags.map(a => ({ v: r[a], color: COL[a], name: AG[a], f: "agent:" + a })), tip: [r.sessions + " phiên", "Dùng lần cuối: " + dt(r.last)] })), fx: v => String(Math.round(v * 10) / 10), fv: v => v + " lần", xTitle: "Số lần nạp", aria: "Thanh ngang số lần nạp mỗi skill theo agent" }) : "", empty: "Không có skill nào được cài.", legend: agentLegend(), caption: "Đếm mỗi lần agent đọc SKILL.md, gọi công cụ Skill, sự kiện skill.invoked của Copilot, hoặc một lần mỗi phiên khi hook nạp sẵn (ponytail). Skill chưa dùng hiển thị 0 lần. Bấm một màu để lọc agent." });
}

