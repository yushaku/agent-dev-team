import * as C from "../lib/charts.js";
import {
  $, esc, AG, AGENTS, zeroAg, COL, PARTS, GROUPS, ROLE_SRC, GATE, groupOf, roleCol,
  buildMixColours, mixCol, mixName, fmt, usd, pct, pad, dt, hm, dm, dur, median, sum,
  costCell, cut, r1, splitWhy, sessionsF, agentsF, buckets, bval, A, svg, fill, widthOf,
  fig, agentLegend, partLegend, groupLegend, scale, timeTicks, yAxis, vBars, hBars,
  arcPath, donut, squarify, spark, mixc, gantt, hideTip
} from "../lib/charts.js";

function repoTree(S) {
  const tree = {};
  S.forEach(s => { const r = tree[s.repo] = tree[s.repo] || {}; (r[s.worktree] = r[s.worktree] || []).push(s); });
  const agg = X => ({ c: sum(X.filter(s => s.agent === "claude"), s => s.total), x: sum(X.filter(s => s.agent === "codex"), s => s.total), p: sum(X.filter(s => s.agent === "copilot"), s => s.total), h: sum(X.filter(s => s.agent === "hermes"), s => s.total), t: sum(X, s => s.total), n: X.length, calls: sum(X, s => s.calls), first: Math.min(...X.map(s => s.t0 || s.start || Infinity)), last: Math.max(...X.map(s => s.end || 0)) });
  return Object.entries(tree).map(([repo, wts]) => {
    const all = [].concat(...Object.values(wts));
    return { repo, a: agg(all), wts: Object.entries(wts).map(([wt, X]) => ({ wt, a: agg(X) })).sort((p, q) => q.a.t - p.a.t) };
  }).sort((p, q) => q.a.t - p.a.t);
}
/* Colour by agent share: nested color-mix of the three agent colours, weighted by tokens. */
const shareCol = a => {
  const w = [[a.c, "var(--claude)"], [a.x, "var(--codex)"], [a.p || 0, "var(--copilot)"], [a.h || 0, "var(--hermes)"]].filter(z => z[0] > 0).sort((p, q) => q[0] - p[0]);
  if (!w.length) return "var(--overlay0)";
  let col = w[w.length - 1][1], acc = w[w.length - 1][0];
  for (let i = w.length - 2; i >= 0; i--) { const p = Math.round(100 * w[i][0] / (w[i][0] + acc)); col = p >= 100 ? w[i][1] : `color-mix(in srgb, ${w[i][1]} ${p}%, ${col})`; acc += w[i][0]; }
  return col;
};
export function renderRepos(S) {
  const R = repoTree(S);
  let W = widthOf("#c-tree");
  const H = Math.round(Math.min(560, Math.max(300, W * 0.55))), g = [];
  squarify(R.map(r => ({ v: r.a.t, r })), 0, 0, W, H).forEach(({ item, x, y, w, h }) => {
    const r = item.r, head = h > 44 && w > 60 ? 22 : 0;
    g.push(`<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" style="fill:var(--surface0);stroke:var(--mantle);stroke-width:3"${A({ f: "repo:" + r.repo, tip: ["Repo " + r.repo, "Claude: " + fmt(r.a.c), "Codex: " + fmt(r.a.x), "Copilot: " + fmt(r.a.p), "Hermes: " + fmt(r.a.h), "Tổng: " + fmt(r.a.t), r.wts.length + " worktree, " + r.a.n + " phiên", "Bấm để lọc"] })}/>`);
    if (head) g.push(`<text x="${r1(x + 8)}" y="${r1(y + 16)}" class="v" style="font-weight:600"${A({ f: "repo:" + r.repo, tip: ["Repo " + r.repo, "Bấm để lọc"] })}>${esc(cut(r.repo + " " + fmt(r.a.t), Math.floor((w - 12) / 7)))}</text>`);
    squarify(r.wts.map(w2 => ({ v: w2.a.t, w: w2 })), x + 3, y + 3 + head, w - 6, h - 6 - head).forEach(t => {
      const wt = t.item.w, a = wt.a;
      g.push(`<rect x="${r1(t.x)}" y="${r1(t.y)}" width="${r1(Math.max(0, t.w))}" height="${r1(Math.max(0, t.h))}" rx="3" style="fill:${shareCol(a)};stroke:var(--mantle);stroke-width:2"${A({ f: "wt:" + r.repo + "/" + wt.wt, tip: [r.repo + " / " + wt.wt, "Claude: " + fmt(a.c) + " (" + pct(a.c, a.t) + ")", "Codex: " + fmt(a.x) + " (" + pct(a.x, a.t) + ")", "Copilot: " + fmt(a.p) + " (" + pct(a.p, a.t) + ")", "Hermes: " + fmt(a.h) + " (" + pct(a.h, a.t) + ")", a.n + " phiên, " + fmt(a.calls) + " lượt gọi", "Hoạt động cuối: " + dt(a.last), "Bấm để lọc worktree"] })}/>`);
      if (t.w > 56 && t.h > 22) g.push(`<text x="${r1(t.x + 6)}" y="${r1(t.y + 16)}" class="ink" pointer-events="none">${esc(cut(wt.wt, Math.floor((t.w - 10) / 7)))}</text>`);
      if (t.w > 56 && t.h > 40) g.push(`<text x="${r1(t.x + 6)}" y="${r1(t.y + 32)}" class="ink" style="font-weight:400" pointer-events="none">${fmt(a.t)}</text>`);
    });
  });
  fig("#c-tree", { title: "Repo và worktree theo token", body: R.length ? svg(W, H, "Treemap repo rồi worktree, diện tích theo token, màu theo tỷ lệ agent", g.join("")) : "",
    legend: [{ name: "Toàn Claude", color: "var(--claude)", f: "agent:claude" }, { name: "Toàn Codex", color: "var(--codex)", f: "agent:codex" }, { name: "Toàn Copilot", color: "var(--copilot)", f: "agent:copilot" }, { name: "Toàn Hermes", color: "var(--hermes)", f: "agent:hermes" }, { name: "Nửa Claude, nửa Codex", color: "color-mix(in srgb, var(--codex) 50%, var(--claude))" }],
    caption: "Khối lớn là repo, ô bên trong là worktree; diện tích theo tổng token, màu pha theo phần token của từng agent. Bấm ô để lọc worktree, bấm tên repo để lọc repo." });
  // last activity per repo
  W = widthOf("#c-active");
  const d = C.state.data, t0 = d.range_start, t1 = d.generated_at;
  const LW = Math.min(180, Math.round(W * 0.3)), RW = 96, pw = W - LW - RW - 8, rowH = 26, T = 8, H2 = T + R.length * rowH + 40, a = [];
  const X = t => r1(LW + pw * (Math.min(Math.max(t, t0), t1) - t0) / (t1 - t0));
  timeTicks(t0, t1, Math.max(3, Math.floor(pw / 70))).forEach(([t, lab]) => a.push(`<line class="gl" x1="${X(t)}" x2="${X(t)}" y1="${T}" y2="${T + R.length * rowH}"/><text x="${X(t)}" y="${T + R.length * rowH + 16}" text-anchor="middle">${lab}</text>`));
  R.forEach((r, i) => {
    const cy = T + i * rowH + rowH / 2, x0 = X(r.a.first), x1 = X(r.a.last);
    a.push(`<text x="0" y="${cy + 4}" class="v"${A({ f: "repo:" + r.repo, tip: ["Repo " + r.repo, "Bấm để lọc"] })}>${esc(cut(r.repo, Math.floor(LW / 7)))}</text>`);
    a.push(`<rect x="${x0}" y="${cy - 4}" width="${r1(Math.max(2, x1 - x0))}" height="8" rx="4" style="fill:${shareCol(r.a)}"${A({ f: "repo:" + r.repo, tip: ["Repo " + r.repo, "Hoạt động đầu trong khoảng: " + dt(r.a.first), "Hoạt động cuối: " + dt(r.a.last), "Bấm để lọc"] })}/><circle cx="${x1}" cy="${cy}" r="5" style="fill:var(--text)"/>`);
    a.push(`<text x="${LW + pw + 8}" y="${cy + 4}">${dt(r.a.last)}</text>`);
  });
  a.push(`<text x="${LW + pw / 2}" y="${H2 - 4}" text-anchor="middle">Thời gian trong khoảng đã chọn</text>`);
  fig("#c-active", { title: "Hoạt động theo repo", body: R.length ? svg(W, H2, "Thanh từ hoạt động đầu đến hoạt động cuối của mỗi repo", a.join("")) : "", legend: [{ name: "Chấm: hoạt động cuối", color: "var(--text)" }], caption: "Thanh từ lượt gọi đầu tiên đến lượt cuối của repo trong khoảng; màu theo tỷ lệ agent như treemap." });
}

/* ---------- Runs ---------- */
