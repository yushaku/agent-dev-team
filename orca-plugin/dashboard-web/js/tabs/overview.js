import * as C from "../lib/charts.js";
import {
  $,
  esc,
  AG,
  zeroAg,
  COL,
  PARTS,
  mixCol,
  mixName,
  fmt,
  pct,
  dt,
  sum,
  sessionCount,
  agentsF,
  buckets,
  bval,
  widthOf,
  fig,
  agentLegend,
  partLegend,
  vBars,
  hBars,
} from "../lib/charts.js";

export function renderOverview(S) {
  const d = C.state.data;
  const B = buckets(),
    ags = agentsF();
  const per = B.map((b) => {
    const totals = zeroAg();
    S.forEach((s) => {
      const v = bval(s, b);
      if (v) totals[s.agent] += v[0] + v[1] + v[2] + v[3];
    });
    return totals;
  });
  const T = (X, k) => sum(X, (s) => s[k]);
  const measurement = `${fmt(
    T(
      S.filter((s) => s.attribution === "dispatch_window"),
      "total",
    ),
  )} token suy từ dispatch; ${fmt(
    T(
      S.filter((s) => s.aggregate),
      "total",
    ),
  )} token chỉ có tổng phiên, xếp ở ngày bắt đầu. ${fmt(d.attribution?.undated || 0)} token thiếu thời gian không tính trong khoảng ngày.`;
  const tiles = [
    ["Tổng token", fmt(T(S, "total")), measurement],
    ["Output", fmt(T(S, "out")), `Reasoning: ${fmt(T(S, "reason"))} token, đã nằm trong output`],
    ["Phiên", String(sessionCount(S)), "Số phiên riêng biệt trong bộ lọc"],
    ["Lượt gọi", fmt(T(S, "calls")), "Số lượt gọi đã biết trong bộ lọc"],
  ];
  $("#kpi").innerHTML = tiles
    .map(([label, value, tip]) => `<article class="card tile" title="${esc(tip)}"><h4>${esc(label)}</h4><span class="big">${esc(value)}</span></article>`)
    .join("");
  const unit = d.days === 1 ? "giờ" : "ngày";
  let W = widthOf("#c-daily");
  fig("#c-daily", {
    title: `Token mỗi ${unit}`,
    body: S.length
      ? vBars({
          W,
          cats: B,
          series: ags.map((a) => ({ name: AG[a], color: COL[a], f: "agent:" + a })),
          get: (i, j) => per[i][ags[j]],
          fv: (v) => fmt(v) + " token",
          yTitle: "Token",
          xTitle: d.days === 1 ? "Giờ trong ngày" : "Ngày",
          aria: "Cột chồng token mỗi " + unit + " theo agent",
        })
      : "",
    legend: agentLegend(),
  });
  // token composition per agent
  W = widthOf("#c-parts");
  const groups = ags.map((a) => [a, S.filter((s) => s.agent === a)]).filter(([, X]) => T(X, "total") > 0);
  fig("#c-parts", {
    title: "Thành phần token theo agent",
    body: groups.length
      ? hBars({
          W,
          LW: 100,
          rows: groups.map(([a, X]) => ({ label: AG[a], f: "agent:" + a, segs: PARTS.map(([k, n]) => ({ name: n, v: T(X, k), color: COL[k] })) })),
          xTitle: "Token",
          aria: "Thành phần token theo agent",
        })
      : "",
    legend: partLegend(),
  });
  // model + effort mix
  const mix = {};
  S.forEach((s) =>
    Object.entries(s.mix).forEach(([k, v]) => {
      const key = s.agent + "|" + k;
      mix[key] = (mix[key] || 0) + v;
    }),
  );
  const rows = Object.entries(mix).sort((a, b) => b[1] - a[1]),
    tot = sum(rows, (x) => x[1]);
  W = widthOf("#c-mix");
  fig("#c-mix", {
    title: "Top 10 model và effort",
    body: rows.length
      ? hBars({
          W,
          LW: 320,
          rows: rows.slice(0, 10).map(([k, v]) => ({
            label: mixName(k),
            full: mixName(k),
            f: "agent:" + k.split("|")[0],
            segs: [{ name: mixName(k), v, color: mixCol(k) }],
            right: [{ t: fmt(v) }, { t: pct(v, tot) }],
          })),
          xTitle: "Token",
          aria: "10 model và effort dùng nhiều token nhất",
        })
      : "",
  });
  // top 10
  const top = [...S].sort((a, b) => b.total - a.total).slice(0, 10);
  W = widthOf("#c-top");
  fig("#c-top", {
    title: "Top 10 phiên theo token",
    body: top.length
      ? hBars({
          W,
          LW: 280,
          RW: 120,
          rows: top.map((s) => ({
            label: `${s.repo}/${s.worktree}${s.role ? ", " + s.role : ""}`,
            full: `${AG[s.agent]}: ${s.repo} / ${s.worktree}${s.role ? ", vai " + s.role : ""}, ${dt(s.start)}`,
            dot: COL[s.agent],
            sid: s.id,
            segs: PARTS.map(([k, n]) => ({ v: s[k], color: COL[k], name: n })),
            right: [{ t: fmt(s.total) }],
          })),
          xTitle: "Token",
          aria: "Thanh ngang 10 phiên tốn nhất",
        })
      : "",
    legend: agentLegend().concat(partLegend()),
  });
}
