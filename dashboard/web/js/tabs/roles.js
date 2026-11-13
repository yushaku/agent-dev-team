import * as C from "../lib/charts.js";
import {
  $, esc, AG, AGENTS, zeroAg, COL, PARTS, GROUPS, ROLE_SRC, GATE, groupOf, roleCol,
  buildMixColours, mixCol, mixName, fmt, usd, pct, pad, dt, hm, dm, dur, median, sum,
  costCell, cut, r1, splitWhy, sessionsF, agentsF, buckets, bval, A, svg, fill, widthOf,
  fig, agentLegend, partLegend, groupLegend, scale, timeTicks, yAxis, vBars, hBars,
  arcPath, donut, squarify, spark, mixc, gantt, hideTip
} from "../lib/charts.js";

function tierOf(model) {
  const t = C.state.data.roles_cfg.tiers;
  for (const k of Object.keys(t)) if (model && (model === t[k].codex || model.includes(t[k].claude))) return k;
  return null;
}
const EFF = ["minimal", "low", "medium", "high", "xhigh"];
function roleStats(S) {
  const cfg = C.state.data.roles_cfg, order = cfg.order, by = {};
  S.forEach(s => (by[s.role] = by[s.role] || []).push(s));
  return Object.entries(by).map(([role, X]) => {
    const def = cfg.roles[role];
    let hi = 0, effHi = 0;
    if (def && def.tier) X.forEach(s => {
      const t = tierOf(s.model);
      if (!t) return;
      if (order.indexOf(t) > order.indexOf(def.tier)) hi++;
      else if (t === def.tier && EFF.indexOf(s.effort) > EFF.indexOf(cfg.tiers[t].effort)) effHi++;
    });
    const mix = {};
    X.forEach(s => Object.entries(s.mix).forEach(([k, v]) => { const key = s.agent + "|" + k; mix[key] = (mix[key] || 0) + v; }));
    return { role, X, def, hi, effHi, mix, total: sum(X, s => s.total), ctx: median([].concat(...X.map(s => s.ctx))) };
  }).sort((a, b) => b.total - a.total);
}
export function renderRoles(S) {
  const R = roleStats(S), total = sum(S, s => s.total);
  let W = widthOf("#c-roles");
  const keys = [...new Set([].concat(...R.map(r => Object.keys(r.mix))))].sort((a, b) => (C.MIXCOL[a] ? 0 : 1) - (C.MIXCOL[b] ? 0 : 1) || a.localeCompare(b));
  fig("#c-roles", { title: "Token theo vai, chia theo model và effort", body: R.length ? hBars({ W, LW: 150, RW: 210, rows: R.map(r => ({
      label: r.role, f: "role:" + r.role, dot: roleCol(r.role), full: `${r.role} (${GROUPS[groupOf(r.role)][0]}), ${r.X.length} phiên, ${pct(r.total, total)} tổng`,
      segs: Object.entries(r.mix).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ v, color: mixCol(k), name: mixName(k), f: "agent:" + k.split("|")[0] })),
      tip: [r.def && r.def.tier ? "Tier mặc định: " + r.def.tier + (r.def.agent ? ", " + (AG[r.def.agent] || r.def.agent) : "") : "Không có tier mặc định", r.hi ? "▲ " + r.hi + " phiên vượt tier" : r.effHi ? "▲ " + r.effHi + " phiên effort cao hơn tier" : null],
      right: [{ t: fmt(r.total) }].concat(r.def && r.def.tier ? [{ t: r.def.tier, color: "var(--subtext0)" }] : [], r.hi ? [{ t: "▲ " + r.hi + (W < 520 ? "" : " vượt tier"), color: "var(--red)" }] : r.effHi ? [{ t: "▲ " + r.effHi + (W < 520 ? "" : " effort cao"), color: "var(--yellow)" }] : []),
    })), xTitle: "Token", aria: "Thanh ngang token theo vai" }) : "",
    legend: keys.map(k => ({ name: mixName(k), color: mixCol(k) })).concat(groupLegend([...new Set(R.map(r => groupOf(r.role)))]).map(l => ({ name: "Nhóm " + l.name, color: l.color }))),
    caption: "Ô vuông đầu dòng là nhóm vai. Sau thanh: tổng token, tier mặc định, dấu ▲ khi có phiên chạy trên tier hoặc effort cao hơn mặc định. Bấm tên vai để lọc." });
  // bubble: sessions vs median context per call, size = tokens
  W = widthOf("#c-bubble");
  const H = 320, L = 64, Rm = 24, T = 20, B = 44, pw = W - L - Rm, ph = H - T - B, g = [];
  const sx = scale(Math.max(1, ...R.map(r => r.X.length))), sy = scale(Math.max(1, ...R.map(r => r.ctx)));
  const maxT = Math.max(1, ...R.map(r => r.total)), rmax = Math.min(36, pw / 10);
  yAxis(g, { L, R: Rm, T, ph, W, top: sy.top, ticks: sy.ticks, f: fmt, title: "Context trung vị mỗi lượt" });
  sx.ticks.forEach(v => { const x = r1(L + pw * v / sx.top); g.push(`<text x="${x}" y="${T + ph + 18}" text-anchor="middle">${v}</text>`); });
  g.push(`<line class="ax" x1="${L}" x2="${W - Rm}" y1="${T + ph}" y2="${T + ph}"/><text x="${L + pw / 2}" y="${H - 4}" text-anchor="middle">Số phiên</text>`);
  [...R].sort((a, b) => b.total - a.total).forEach(r => {
    const x = r1(L + pw * r.X.length / sx.top), y = r1(T + ph - ph * r.ctx / sy.top), rad = r1(5 + rmax * Math.sqrt(r.total / maxT));
    g.push(`<circle cx="${x}" cy="${y}" r="${rad}" style="fill:${roleCol(r.role)};stroke:var(--mantle);stroke-width:1.5"${A({ f: "role:" + r.role, tip: [r.role + " (" + GROUPS[groupOf(r.role)][0] + ")", "Phiên: " + r.X.length, "Context trung vị: " + fmt(r.ctx), "Token: " + fmt(r.total), "Bấm để lọc"] })}/><text x="${r1(x + rad + 4)}" y="${y + 4}" class="v">${esc(r.role)}</text>`);
  });
  fig("#c-bubble", { title: "Số phiên và context mỗi lượt theo vai", body: R.length ? svg(W, H, "Biểu đồ bong bóng: số phiên và context trung vị theo vai", g.join("")) : "", legend: groupLegend([...new Set(R.map(r => groupOf(r.role)))]), caption: "Bong bóng càng to càng nhiều token. Vai ở góc trên phải vừa nhiều phiên vừa đọc context dài: chỗ nên cắt spec hoặc tách task." });
  $("#t-roles").innerHTML = R.length ? `<table><thead><tr><th>Vai</th><th class="num">Claude</th><th class="num">Codex</th><th class="num">Copilot</th><th class="num">Hermes</th><th class="num">Phiên</th><th>Model / effort đã dùng</th><th class="num">Context trung vị</th><th class="num">Tỷ lệ</th><th>Mặc định</th><th>Tier</th></tr></thead><tbody>${R.map(r => {
    const models = {};
    r.X.forEach(s => { const k = s.model + " / " + s.effort; models[k] = (models[k] || 0) + 1; });
    const flag = !r.def || !r.def.tier ? '<span class="chip neutral">không có tier</span>' : r.hi ? `<span class="chip risk">${r.hi} phiên vượt tier</span>` : r.effHi ? `<span class="chip warn">${r.effHi} phiên effort cao hơn</span>` : '<span class="chip ok">đúng tier</span>';
    const defTxt = r.def && r.def.tier ? `${r.def.tier}${r.def.agent ? ", " + (AG[r.def.agent] || r.def.agent) : ""}` : r.def ? "không có tier" : "?";
    return `<tr><td>${esc(r.role)}</td><td class="num">${fmt(sum(r.X.filter(s => s.agent === "claude"), s => s.total))}</td><td class="num">${fmt(sum(r.X.filter(s => s.agent === "codex"), s => s.total))}</td><td class="num">${fmt(sum(r.X.filter(s => s.agent === "copilot"), s => s.total))}</td><td class="num">${fmt(sum(r.X.filter(s => s.agent === "hermes"), s => s.total))}</td><td class="num">${r.X.length}</td>
      <td class="small">${Object.entries(models).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<code>${esc(k)}</code> x${n}`).join("<br>")}</td>
      <td class="num">${fmt(r.ctx)}</td><td class="num">${pct(r.total, total)}</td><td class="nowrap">${esc(defTxt)}</td><td>${flag}</td></tr>`;
  }).join("")}</tbody></table>` : '<p class="muted">Không có phiên nào.</p>';
}

/* ---------- Theo repo ---------- */
