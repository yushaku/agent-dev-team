import { $, AG, fmt, sessionsF, state, widthOf, fig, hBars, roleCol } from "../lib/charts.js";

export const KINDS = [
  ["codegraph", "Codegraph", "var(--green)"],
  ["rg", "rg", "var(--blue)"],
  ["grep", "grep", "var(--peach)"],
  ["find", "find/glob", "var(--yellow)"],
  ["read_full", "Đọc cả file", "var(--red)"],
  ["read_part", "Đọc một đoạn", "var(--overlay1)"],
];
const hiddenKinds = () => state.searchHidden || [];
const visibleKinds = () => KINDS.filter(([kind]) => !hiddenKinds().includes(kind));
const legend = () =>
  KINDS.map(([kind, name, color]) => ({
    name,
    color,
    toggle: "search:" + kind,
    pressed: !hiddenKinds().includes(kind),
  }));
const cnt = (o, k) => (o && o[k]) || 0;
const total = (o) => KINDS.reduce((a, [k]) => a + cnt(o, k), 0);

export function toggleSearchKind(kind) {
  if (!KINDS.some(([k]) => k === kind)) return false;
  const hidden = new Set(hiddenKinds());
  if (hidden.has(kind)) hidden.delete(kind);
  else hidden.add(kind);
  state.searchHidden = [...hidden];
  return true;
}

function group(S, key) {
  const by = {};
  S.forEach((s) => {
    const g = key(s);
    if (!g) return;
    const r = by[g] || (by[g] = { search: {}, sessions: 0, cg: 0, sym: 0 });
    r.sessions++;
    if (cnt(s.search, "codegraph")) r.cg++;
    r.sym += cnt(s.search, "rg_symbol"); // not in KINDS: no bar segment, not in totals
    KINDS.forEach(([k]) => {
      r.search[k] = cnt(r.search, k) + cnt(s.search, k);
    });
  });
  return Object.entries(by)
    .filter(([, r]) => total(r.search))
    .sort((a, b) => total(b[1].search) - total(a[1].search));
}

function bars(id, rows, title, caption, o = {}) {
  const W = widthOf(id);
  const kinds = visibleKinds();
  const totalVisible = (search) => kinds.reduce((n, [kind]) => n + cnt(search, kind), 0);
  const shownCodegraph = kinds.some(([kind]) => kind === "codegraph");
  const visibleRows = rows.filter(([, r]) => totalVisible(r.search));
  fig(id, {
    title,
    subtitle: o.subtitle,
    legend: legend(),
    caption,
    body: visibleRows.length
      ? hBars({
          W,
          LW: o.LW || 240,
          RW: 150,
          rowH: 24,
          rows: visibleRows.slice(0, 20).map(([label, r]) => {
            const t = totalVisible(r.search),
              cg = cnt(r.search, "codegraph");
            const searches = ["codegraph", "rg", "grep", "find"].reduce((n, k) => n + cnt(r.search, k), 0);
            return {
              label,
              full: label,
              ...(o.roles ? { dot: roleCol(label), f: "role:" + label } : {}),
              segs: kinds.map(([k, name, color]) => ({ v: cnt(r.search, k), color, name })),
              right: [{ t: fmt(t) }].concat(
                shownCodegraph ? [{ t: "codegraph " + Math.round(searches ? (100 * cg) / searches : 0) + "%", color: "var(--subtext0)" }] : [],
              ),
              tip: [label, r.sessions + " phiên, " + r.cg + " phiên có codegraph"].concat(
                kinds.map(([k, n]) => n + ": " + cnt(r.search, k)),
                o.roles && r.sym > 0 ? ["rg/grep tìm symbol: " + r.sym] : [],
              ),
            };
          }),
          fv: (v) => v + " lần",
          xTitle: "Số lần gọi",
          aria: title,
        })
      : "",
    empty: kinds.length ? "Không có lượt tìm code nào với các công cụ đang hiện." : "Đã ẩn toàn bộ công cụ. Bấm legend để hiện lại.",
  });
}

export function renderTaskRoleSearch(S0) {
  const section = $("#task-search");
  if (!section) return;
  const scoped = state.repo || state.runF || state.wt; // whole-team totals mix every project, so wait for a scope
  section.hidden = !scoped;
  if (!scoped) return;
  bars(
    "#c-task-search",
    group(S0 || sessionsF(), (s) => s.role),
    "Tool search code",
    "Phần trăm bên phải là tỉ lệ codegraph trên các lượt tìm (không tính đọc file). Bấm một màu để ẩn hoặc hiện công cụ đó.",
    { roles: true, LW: 150, subtitle: "Mỗi vai tìm và đọc code bằng cách nào trong project, Run hoặc worktree đang lọc" },
  );
}

export function renderSearch(S0) {
  const S = (S0 || sessionsF()).filter((s) => s.search);
  bars(
    "#c-search-agent",
    group(S, (s) => AG[s.agent] || s.agent),
    "Theo agent",
    "Codegraph tính cả MCP (codegraph_explore, ...) và lệnh shell `codegraph explore|query|callers|...`. rg/grep tính cả qua rtk.",
  );
  bars(
    "#c-search-role",
    group(S, (s) => s.role),
    "Theo vai",
    "Vai có tỉ lệ codegraph thấp là nơi nên nhắc dùng codegraph trong role prompt.",
  );
  bars(
    "#c-search-wt",
    group(S, (s) => (s.worktree ? s.repo + "/" + s.worktree : s.repo)),
    "Theo repo / worktree",
    "Worktree chỉ có rg/grep thường là chưa `codegraph init`.",
  );
}
