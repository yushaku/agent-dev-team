import * as C from "../lib/charts.js";
import {
  AG, GROUPS, groupOf, roleCol, mixCol, mixName, fmt, pct,
  sum, sessionCount, widthOf, fig, groupLegend, hBars
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
    return { role, X, def, hi, effHi, mix, total: sum(X, s => s.total) };
  }).sort((a, b) => b.total - a.total);
}
export function renderRoles(S) {
  const R = roleStats(S), total = sum(S, s => s.total);
  const W = widthOf("#c-roles");
  const keys = [...new Set([].concat(...R.map(r => Object.keys(r.mix))))].sort((a, b) => (C.MIXCOL[a] ? 0 : 1) - (C.MIXCOL[b] ? 0 : 1) || a.localeCompare(b));
  fig("#c-roles", { title: "Token theo vai", body: R.length ? hBars({ W, LW: 150, RW: 210, rows: R.map(r => ({
      label: r.role, f: "role:" + r.role, dot: roleCol(r.role), full: `${r.role} (${GROUPS[groupOf(r.role)][0]}), ${sessionCount(r.X)} phiên, ${pct(r.total, total)} tổng`,
      segs: Object.entries(r.mix).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ v, color: mixCol(k), name: mixName(k), f: "agent:" + k.split("|")[0] })),
      tip: [r.def && r.def.tier ? "Tier mặc định: " + r.def.tier + (r.def.agent ? ", " + (AG[r.def.agent] || r.def.agent) : "") : "Không có tier mặc định", r.hi ? "▲ " + r.hi + " phiên vượt tier" : r.effHi ? "▲ " + r.effHi + " phiên effort cao hơn tier" : null],
      right: [{ t: fmt(r.total) }].concat(r.def && r.def.tier ? [{ t: r.def.tier, color: "var(--subtext0)" }] : [], r.hi ? [{ t: "▲ " + r.hi + (W < 520 ? "" : " vượt tier"), color: "var(--red)" }] : r.effHi ? [{ t: "▲ " + r.effHi + (W < 520 ? "" : " effort cao"), color: "var(--yellow)" }] : []),
    })), xTitle: "Token", aria: "Thanh ngang token theo vai" }) : "",
    legend: keys.map(k => ({ name: mixName(k), color: mixCol(k) })).concat(groupLegend([...new Set(R.map(r => groupOf(r.role)))]).map(l => ({ name: "Nhóm " + l.name, color: l.color }))),
    caption: "Ô vuông đầu dòng là nhóm vai. Sau thanh: tổng token, tier mặc định, dấu ▲ khi có phiên chạy trên tier hoặc effort cao hơn mặc định. Bấm tên vai để lọc." });
}
