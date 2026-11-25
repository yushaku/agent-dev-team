import * as C from "../lib/charts.js";
import { AG, GROUPS, groupOf, roleCol, mixCol, mixName, fmt, pct, sum, sessionCount, widthOf, fig, groupLegend, hBars } from "../lib/charts.js";

const EFF = ["minimal", "low", "medium", "high", "xhigh"];
export function roleStats(S) {
  const cfg = C.state.data.roles_cfg,
    by = {};
  S.forEach((s) => (by[s.role] = by[s.role] || []).push(s));
  return Object.entries(by)
    .map(([role, X]) => {
      const selectedTiers = [...new Set(X.map((s) => s.routing?.tier).filter(Boolean))];
      const def = selectedTiers.length ? { tier: selectedTiers.join(" / "), selected: true } : cfg.roles[role];
      let mismatch = 0,
        effHi = 0;
      X.forEach((s) => {
        const r = s.routing;
        if (!r) return;
        if (r.agent !== s.agent || (r.model && !(s.model || "").toLowerCase().includes(r.model.toLowerCase()))) {
          mismatch++;
          return;
        }
        if (r.model && EFF.includes(r.effort) && EFF.includes(s.effort) && EFF.indexOf(s.effort) > EFF.indexOf(r.effort)) effHi++;
      });
      const mix = {};
      X.forEach((s) =>
        Object.entries(s.mix).forEach(([k, v]) => {
          const key = s.agent + "|" + k;
          mix[key] = (mix[key] || 0) + v;
        }),
      );
      return { role, X, def, mismatch, effHi, unverified: X.filter((s) => !s.routing?.model).length, mix, total: sum(X, (s) => s.total) };
    })
    .sort((a, b) => b.total - a.total);
}
export function renderRoles(S) {
  const R = roleStats(S),
    total = sum(S, (s) => s.total);
  const W = widthOf("#c-roles");
  const keys = [...new Set([].concat(...R.map((r) => Object.keys(r.mix))))].sort((a, b) => (C.MIXCOL[a] ? 0 : 1) - (C.MIXCOL[b] ? 0 : 1) || a.localeCompare(b));
  fig("#c-roles", {
    title: "Token theo vai",
    subtitle: "Mỗi vai tốn bao nhiêu token, chạy model nào và có đúng tier mặc định không",
    body: R.length
      ? hBars({
          W,
          LW: 150,
          RW: 210,
          rows: R.map((r) => ({
            label: r.role,
            f: "role:" + r.role,
            dot: roleCol(r.role),
            full: `${r.role} (${GROUPS[groupOf(r.role)][0]}), ${sessionCount(r.X)} phiên, ${pct(r.total, total)} tổng`,
            segs: Object.entries(r.mix)
              .sort((a, b) => b[1] - a[1])
              .map(([k, v]) => ({ v, color: mixCol(k), name: mixName(k), f: "agent:" + k.split("|")[0] })),
            tip: [
              r.def && r.def.tier
                ? (r.def.selected ? "Tier đã chọn: " : "Tier mặc định: ") + r.def.tier + (r.def.agent ? ", " + (AG[r.def.agent] || r.def.agent) : "")
                : "Không có tier mặc định",
              r.unverified ? r.unverified + " phiên chưa đối chiếu model" : null,
              r.mismatch ? "▲ " + r.mismatch + " phiên khác model/agent đã chọn" : r.effHi ? "▲ " + r.effHi + " phiên effort cao hơn cấu hình" : null,
            ],
            right: [{ t: fmt(r.total) }].concat(
              r.def && r.def.tier ? [{ t: r.def.tier, color: "var(--subtext0)" }] : [],
              r.mismatch
                ? [{ t: "▲ " + r.mismatch + (W < 520 ? "" : " khác model"), color: "var(--red)" }]
                : r.effHi
                  ? [{ t: "▲ " + r.effHi + (W < 520 ? "" : " effort cao"), color: "var(--yellow)" }]
                  : [],
            ),
          })),
          xTitle: "Token",
          aria: "Thanh ngang token theo vai",
        })
      : "",
    legend: keys
      .map((k) => ({ name: mixName(k), color: mixCol(k) }))
      .concat(groupLegend([...new Set(R.map((r) => groupOf(r.role)))]).map((l) => ({ name: "Nhóm " + l.name, color: l.color }))),
  });
}
