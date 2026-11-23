import * as C from "../lib/charts.js";
import { esc, fmt, pct, dt, sum, cut, r1, A, svg, widthOf, fig, squarify } from "../lib/charts.js";

export function repoTree(S) {
  const tree = {}, runs = new Map((C.state.data.orca?.runs || []).map(r => [r.id, r]));
  S.forEach(s => {
    const run = runs.get(s.run_id), repo = run?.repo || s.repo;
    const key = s.run_id ? "run:" + s.run_id : "wt:" + s.worktree;
    const r = tree[repo] = tree[repo] || {};
    const group = r[key] = r[key] || { wt: run?.objective || s.run_id || s.worktree,
      filter: s.run_id ? "runF:" + s.run_id : "wt:" + repo + "/" + s.worktree, sessions: [] };
    group.sessions.push(s);
  });
  const agg = X => ({ c: sum(X.filter(s => s.agent === "claude"), s => s.total), x: sum(X.filter(s => s.agent === "codex"), s => s.total), p: sum(X.filter(s => s.agent === "copilot"), s => s.total), h: sum(X.filter(s => s.agent === "hermes"), s => s.total), j: sum(X.filter(s => s.agent === "jcode"), s => s.total), t: sum(X, s => s.total), n: X.length, calls: sum(X, s => s.calls), last: Math.max(...X.map(s => s.end || 0)) });
  return Object.entries(tree).map(([repo, wts]) => {
    const all = Object.values(wts).flatMap(w => w.sessions);
    return { repo, a: agg(all), wts: Object.values(wts).map(w => ({ wt: w.wt, filter: w.filter, a: agg(w.sessions) })).sort((p, q) => q.a.t - p.a.t) };
  }).sort((p, q) => q.a.t - p.a.t);
}
/* Colour by agent share: nested color-mix of the three agent colours, weighted by tokens. */
const shareCol = a => {
  const w = [[a.c, "var(--claude)"], [a.x, "var(--codex)"], [a.p || 0, "var(--copilot)"], [a.h || 0, "var(--hermes)"], [a.j || 0, "var(--jcode)"]].filter(z => z[0] > 0).sort((p, q) => q[0] - p[0]);
  if (!w.length) return "var(--overlay0)";
  let col = w[w.length - 1][1], acc = w[w.length - 1][0];
  for (let i = w.length - 2; i >= 0; i--) { const p = Math.round(100 * w[i][0] / (w[i][0] + acc)); col = p >= 100 ? w[i][1] : `color-mix(in srgb, ${w[i][1]} ${p}%, ${col})`; acc += w[i][0]; }
  return col;
};
export function renderRepos(S) {
  const R = repoTree(S);
  const W = widthOf("#c-tree");
  const H = Math.round(Math.min(560, Math.max(300, W * 0.55))), g = [];
  squarify(R.map(r => ({ v: r.a.t, r })), 0, 0, W, H).forEach(({ item, x, y, w, h }) => {
    const r = item.r, head = h > 44 && w > 60 ? 22 : 0;
    g.push(`<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" style="fill:var(--surface0);stroke:var(--mantle);stroke-width:3"${A({ f: "repo:" + r.repo, tip: ["Repo " + r.repo, "Claude: " + fmt(r.a.c), "Codex: " + fmt(r.a.x), "Copilot: " + fmt(r.a.p), "Hermes: " + fmt(r.a.h), "Tổng: " + fmt(r.a.t), r.wts.length + " nhóm công việc, " + r.a.n + " phiên", "Bấm để lọc"] })}/>`);
    if (head) g.push(`<text x="${r1(x + 8)}" y="${r1(y + 16)}" class="v" style="font-weight:600"${A({ f: "repo:" + r.repo, tip: ["Repo " + r.repo, "Bấm để lọc"] })}>${esc(cut(r.repo + " " + fmt(r.a.t), Math.floor((w - 12) / 7)))}</text>`);
    squarify(r.wts.map(w2 => ({ v: w2.a.t, w: w2 })), x + 3, y + 3 + head, w - 6, h - 6 - head).forEach(t => {
      const wt = t.item.w, a = wt.a;
      g.push(`<rect x="${r1(t.x)}" y="${r1(t.y)}" width="${r1(Math.max(0, t.w))}" height="${r1(Math.max(0, t.h))}" rx="3" style="fill:${shareCol(a)};stroke:var(--mantle);stroke-width:2"${A({ f: wt.filter, tip: [r.repo + " / " + wt.wt, "Claude: " + fmt(a.c) + " (" + pct(a.c, a.t) + ")", "Codex: " + fmt(a.x) + " (" + pct(a.x, a.t) + ")", "Copilot: " + fmt(a.p) + " (" + pct(a.p, a.t) + ")", "Hermes: " + fmt(a.h) + " (" + pct(a.h, a.t) + ")", a.n + " phiên, " + fmt(a.calls) + " lượt gọi", "Hoạt động cuối: " + dt(a.last), "Bấm để lọc nhóm công việc"] })}/>`);
      if (t.w > 56 && t.h > 22) g.push(`<text x="${r1(t.x + 6)}" y="${r1(t.y + 16)}" class="ink" pointer-events="none">${esc(cut(wt.wt, Math.floor((t.w - 10) / 7)))}</text>`);
      if (t.w > 56 && t.h > 40) g.push(`<text x="${r1(t.x + 6)}" y="${r1(t.y + 32)}" class="ink" style="font-weight:400" pointer-events="none">${fmt(a.t)}</text>`);
    });
  });
  fig("#c-tree", { title: "Token theo công việc", body: R.length ? svg(W, H, "Treemap repo rồi Run, diện tích theo token, màu theo tỷ lệ agent", g.join("")) : "",
    legend: [{ name: "Toàn Claude", color: "var(--claude)", f: "agent:claude" }, { name: "Toàn Codex", color: "var(--codex)", f: "agent:codex" }, { name: "Toàn Copilot", color: "var(--copilot)", f: "agent:copilot" }, { name: "Toàn Hermes", color: "var(--hermes)", f: "agent:hermes" }, { name: "Toàn jcode", color: "var(--jcode)", f: "agent:jcode" }, { name: "Nửa Claude, nửa Codex", color: "color-mix(in srgb, var(--codex) 50%, var(--claude))" }] });
}
