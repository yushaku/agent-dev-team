import * as C from "../lib/charts.js";
import { esc, fmt, dt, sum, cut, r1, A, svg, widthOf, fig, squarify } from "../lib/charts.js";

const WORK_COLOURS = ["blue", "green", "peach", "sky"];
const workColour = key => {
  let hash = 0;
  for (const c of key) hash = (Math.imul(hash, 31) + c.codePointAt(0)) >>> 0;
  return `color-mix(in srgb, var(--${WORK_COLOURS[hash % WORK_COLOURS.length]}) 28%, var(--mantle))`;
};

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
  const agg = X => ({ t: sum(X, s => s.total), n: X.length, calls: sum(X, s => s.calls), last: Math.max(...X.map(s => s.end || 0)) });
  return Object.entries(tree).map(([repo, wts]) => {
    const all = Object.values(wts).flatMap(w => w.sessions);
    return { repo, a: agg(all), wts: Object.values(wts).map(w => ({ wt: w.wt, filter: w.filter, a: agg(w.sessions) })).sort((p, q) => q.a.t - p.a.t) };
  }).sort((p, q) => q.a.t - p.a.t);
}
export function renderRepos(S) {
  const R = repoTree(S);
  const W = widthOf("#c-tree");
  const H = Math.round(Math.min(280, Math.max(200, W * 0.36))), g = [];
  squarify(R.map(r => ({ v: r.a.t, r })), 0, 0, W, H).forEach(({ item, x, y, w, h }) => {
    const r = item.r, head = h > 44 && w > 60 ? 22 : 0;
    g.push(`<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" style="fill:var(--surface0);stroke:var(--mantle);stroke-width:3"${A({ f: "repo:" + r.repo, tip: ["Repo " + r.repo, "Tổng: " + fmt(r.a.t), r.wts.length + " nhóm công việc, " + r.a.n + " phiên", "Bấm để lọc"] })}/>`);
    if (head) g.push(`<text x="${r1(x + 8)}" y="${r1(y + 16)}" class="v" style="font-weight:600"${A({ f: "repo:" + r.repo, tip: ["Repo " + r.repo, "Bấm để lọc"] })}>${esc(cut(r.repo + " " + fmt(r.a.t), Math.floor((w - 12) / 7)))}</text>`);
    squarify(r.wts.map(w2 => ({ v: w2.a.t, w: w2 })), x + 3, y + 3 + head, w - 6, h - 6 - head).forEach(t => {
      const wt = t.item.w, a = wt.a;
      g.push(`<rect x="${r1(t.x)}" y="${r1(t.y)}" width="${r1(Math.max(0, t.w))}" height="${r1(Math.max(0, t.h))}" rx="3" style="fill:${workColour(wt.filter)};stroke:var(--mantle);stroke-width:2"${A({ f: wt.filter, tip: [r.repo + " / " + wt.wt, "Tổng: " + fmt(a.t) + " token", a.n + " phiên, " + fmt(a.calls) + " lượt gọi", "Hoạt động cuối: " + dt(a.last), "Bấm để lọc nhóm công việc"] })}/>`);
      if (t.w > 56 && t.h > 22) g.push(`<text x="${r1(t.x + 6)}" y="${r1(t.y + 16)}" class="v" pointer-events="none">${esc(cut(wt.wt, Math.floor((t.w - 10) / 7)))}</text>`);
      if (t.w > 56 && t.h > 40) g.push(`<text x="${r1(t.x + 6)}" y="${r1(t.y + 32)}" class="v" style="font-weight:400" pointer-events="none">${fmt(a.t)}</text>`);
    });
  });
  fig("#c-tree", { title: "Token theo công việc", body: R.length ? svg(W, H, "Treemap repo rồi Run hoặc worktree, diện tích theo token, màu theo nhóm công việc", g.join("")) : "" });
}
