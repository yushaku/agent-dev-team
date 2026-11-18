import { $, esc, AG, COL, fmt, sessionsF, state, widthOf, fig, hBars, median } from "../lib/charts.js";

export const KINDS = [
  ["codegraph", "Codegraph", "var(--green)"],
  ["rg", "rg", "var(--blue)"],
  ["grep", "grep", "var(--peach)"],
  ["find", "find/glob", "var(--yellow)"],
  ["read_full", "Đọc cả file", "var(--red)"],
  ["read_part", "Đọc một đoạn", "var(--overlay1)"],
];
const legend = KINDS.map(([, name, color]) => ({ name, color }));
const cnt = (o, k) => (o && o[k]) || 0;
const total = o => KINDS.reduce((a, [k]) => a + cnt(o, k), 0);

function group(S, key) {
  const by = {};
  S.forEach(s => {
    const g = key(s);
    if (!g) return;
    const r = by[g] || (by[g] = { search: {}, sessions: 0, cg: 0 });
    r.sessions++;
    if (cnt(s.search, "codegraph")) r.cg++;
    KINDS.forEach(([k]) => { r.search[k] = cnt(r.search, k) + cnt(s.search, k); });
  });
  return Object.entries(by).filter(([, r]) => total(r.search)).sort((a, b) => total(b[1].search) - total(a[1].search));
}

function bars(id, rows, title, caption) {
  const W = widthOf(id);
  fig(id, {
    title, legend, caption,
    body: rows.length ? hBars({
      W, LW: 240, rowH: 24,
      rows: rows.slice(0, 20).map(([label, r]) => {
        const t = total(r.search), cg = cnt(r.search, "codegraph");
        return {
          label, full: label,
          segs: KINDS.map(([k, name, color]) => ({ v: cnt(r.search, k), color, name })),
          right: [{ t: fmt(t) }, { t: Math.round(100 * cg / t) + "% cg", color: "var(--subtext0)" }],
          tip: [label, r.sessions + " phiên, " + r.cg + " phiên có codegraph"].concat(KINDS.map(([k, n]) => n + ": " + cnt(r.search, k))),
        };
      }),
      fv: v => v + " lần", xTitle: "Số lần gọi", aria: title,
    }) : "",
    empty: "Không có lượt tìm code nào.",
  });
}

export function renderTaskRoleSearch(S0) {
  const section = $("#task-search");
  if (!section) return;
  section.hidden = !state.repo;
  if (!state.repo) return;
  bars("#c-task-search", group(S0 || sessionsF(), s => s.role), "Theo vai", "Mỗi màu là một cách tìm hoặc đọc code. Dùng chart để thấy vai nào dựa nhiều vào đọc file, rg/grep hoặc codegraph trong project đang lọc.");
}

export function renderSearch(S0) {
  const S = (S0 || sessionsF()).filter(s => s.search);
  const all = {};
  S.forEach(s => KINDS.forEach(([k]) => { all[k] = cnt(all, k) + cnt(s.search, k); }));
  const t = total(all) || 1, cg = cnt(all, "codegraph"), text = cnt(all, "rg") + cnt(all, "grep");
  /* Token per session that searched: with codegraph vs text search only. Rough signal, not causal. */
  const searched = S.filter(s => total(s.search) && s.total);
  const withCg = searched.filter(s => cnt(s.search, "codegraph")).map(s => s.total);
  const without = searched.filter(s => !cnt(s.search, "codegraph")).map(s => s.total);
  const mw = withCg.length ? median(withCg) : 0, mo = without.length ? median(without) : 0;
  const tiles = [
    ["Codegraph", fmt(cg), Math.round(100 * cg / t) + "% lượt tìm code", "var(--green)"],
    ["rg + grep", fmt(text), Math.round(100 * text / t) + "% lượt tìm code", "var(--blue)"],
    ["Đọc cả file", fmt(cnt(all, "read_full")), Math.round(100 * cnt(all, "read_full") / t) + "% lượt, cả file vào context", "var(--red)"],
    ["Đọc một đoạn", fmt(cnt(all, "read_part")), Math.round(100 * cnt(all, "read_part") / t) + "% lượt, chỉ vài dòng", "var(--overlay1)"],
    ["Phiên có codegraph", withCg.length + "/" + searched.length, "phiên có tìm code", "var(--sky)"],
    ["Token trung vị / phiên", (withCg.length ? fmt(mw) : "-") + " vs " + (without.length ? fmt(mo) : "-"), "có codegraph vs không", "var(--lavender)"],
  ];
  $("#c-search-kpi").innerHTML = tiles.map(([h, big, sub, c]) => `<article class="card tile" style="border-top:3px solid ${c}"><h4>${esc(h)}</h4><span class="big">${esc(big)}</span><span class="muted small">${esc(sub)}</span></article>`).join("");
  bars("#c-search-agent", group(S, s => AG[s.agent] || s.agent), "Theo agent", "Codegraph tính cả MCP (codegraph_explore, ...) và lệnh shell `codegraph explore|query|callers|...`. rg/grep tính cả qua rtk.");
  bars("#c-search-role", group(S, s => s.role), "Theo vai", "Vai có tỉ lệ codegraph thấp là nơi nên nhắc dùng codegraph trong role prompt.");
  bars("#c-search-wt", group(S, s => s.worktree ? s.repo + "/" + s.worktree : s.repo), "Theo repo / worktree", "Worktree chỉ có rg/grep thường là chưa `codegraph init`.");
}
