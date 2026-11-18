import { $, AG, fmt, sessionsF, state, widthOf, fig, hBars } from "../lib/charts.js";

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
  bars("#c-task-search", group(S0 || sessionsF(), s => s.role), "Tool search code", "Mỗi màu là một cách tìm hoặc đọc code. Dùng chart để thấy vai nào dựa nhiều vào đọc file, rg/grep hoặc codegraph trong project đang lọc.");
}

export function renderSearch(S0) {
  const S = (S0 || sessionsF()).filter(s => s.search);
  bars("#c-search-agent", group(S, s => AG[s.agent] || s.agent), "Theo agent", "Codegraph tính cả MCP (codegraph_explore, ...) và lệnh shell `codegraph explore|query|callers|...`. rg/grep tính cả qua rtk.");
  bars("#c-search-role", group(S, s => s.role), "Theo vai", "Vai có tỉ lệ codegraph thấp là nơi nên nhắc dùng codegraph trong role prompt.");
  bars("#c-search-wt", group(S, s => s.worktree ? s.repo + "/" + s.worktree : s.repo), "Theo repo / worktree", "Worktree chỉ có rg/grep thường là chưa `codegraph init`.");
}
