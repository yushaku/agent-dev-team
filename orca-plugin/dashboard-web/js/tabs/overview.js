import * as C from "../lib/charts.js";
import {
  $,
  esc,
  AG,
  AGENTS,
  zeroAg,
  COL,
  PARTS,
  GROUPS,
  ROLE_SRC,
  GATE,
  groupOf,
  roleCol,
  buildMixColours,
  mixCol,
  mixName,
  fmt,
  pct,
  pad,
  dt,
  hm,
  dm,
  dur,
  median,
  sum,
  sessionCount,
  cut,
  r1,
  splitWhy,
  sessionsF,
  agentsF,
  buckets,
  bval,
  A,
  svg,
  fill,
  widthOf,
  fig,
  agentLegend,
  partLegend,
  groupLegend,
  scale,
  timeTicks,
  yAxis,
  vBars,
  hBars,
  arcPath,
  donut,
  squarify,
  spark,
  mixc,
  gantt,
  hideTip,
} from "../lib/charts.js";

const SEV = { high: "Cao", medium: "Trung bình", low: "Thấp" };
/* Issues come from the backend (backend/insights.py); each row carries its filter hint in data-issue. */
export function renderIssues(issues) {
  $("#issues").innerHTML = issues.length
    ? `<ul class="issues" aria-label="Danh sách vấn đề">${issues.map((i) => `<li class="issue ${esc(i.severity)}" tabindex="0" role="button" data-issue="${esc(JSON.stringify(i.filter || {}))}" aria-label="${esc((SEV[i.severity] || i.severity) + ": " + i.title)}"><span class="issue-dot" title="${esc(SEV[i.severity] || i.severity)}"></span><span><b>${esc(i.title)}</b><span class="ev">${esc(i.evidence)}</span><span class="fix">${esc(i.suggestion)}</span></span></li>`).join("")}</ul>`
    : '<p class="empty">Không phát hiện vấn đề nào trong khoảng này.</p>';
}
let issuesSeq = 0;
async function loadIssues() {
  const seq = ++issuesSeq,
    st = C.state;
  const q = new URLSearchParams({ days: st.days, format: "json" });
  [
    ["repo", st.repo],
    ["agent", st.agent],
    ["role", st.role],
    ["run", st.runF],
  ].forEach(([k, v]) => {
    if (v) q.set(k, v);
  });
  try {
    const r = await fetch("/api/agent/summary?" + q, { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const body = await r.json();
    if (seq === issuesSeq) renderIssues(body.issues || []);
  } catch (e) {
    if (seq === issuesSeq) $("#issues").innerHTML = '<p class="empty">Không tải được danh sách vấn đề.</p>';
  }
}

export function renderOverview(S) {
  const d = C.state.data;
  loadIssues();
  const f = [
    C.state.repo && "repo " + C.state.repo,
    C.state.wt && "worktree " + C.state.wt,
    C.state.role && "vai " + C.state.role,
    C.state.agent && "chỉ " + AG[C.state.agent],
  ].filter(Boolean);
  $("#ov-lead").textContent =
    `Token Claude, Codex, Copilot và Hermes: ${d.days} ngày gần nhất (từ ${dt(d.range_start).slice(0, 5)}), ${sessionCount(S)} phiên${f.length ? ", " + f.join(", ") : ""}.`;
  $("#measurement-note").textContent = `Trong bộ lọc: ${fmt(
    sum(
      S.filter((s) => s.attribution === "dispatch_window"),
      (s) => s.total,
    ),
  )} token suy từ dispatch; ${fmt(
    sum(
      S.filter((s) => s.aggregate),
      (s) => s.total,
    ),
  )} token chỉ có tổng phiên, xếp ở ngày bắt đầu phiên. Toàn bộ log có ${fmt(d.attribution?.undated || 0)} token thiếu thời gian, không đưa vào khoảng ngày.${d.orca.available ? "" : " Chưa nối được dữ liệu Orca; tỷ lệ phân bổ chưa đầy đủ."}`;
  const B = buckets(),
    ags = agentsF();
  const per = B.map((b) => {
    const seen = new Set();
    const o = Object.assign(zeroAg(), { parts: [0, 0, 0, 0], n: 0, prem: 0 });
    S.forEach((s) => {
      const v = bval(s, b);
      if (!v) return;
      const t = v[0] + v[1] + v[2] + v[3];
      o[s.agent] += t;
      o.prem += v[4] || 0;
      for (let i = 0; i < 4; i++) o.parts[i] += v[i];
      const sid = s.agent + ":" + (s.session_id || s.id);
      if (!seen.has(sid)) {
        o.n++;
        seen.add(sid);
      }
    });
    return o;
  });
  const T = (X, k) => sum(X, (s) => s[k]);
  const Cl = S.filter((s) => s.agent === "claude"),
    Cx = S.filter((s) => s.agent === "codex"),
    Cp = S.filter((s) => s.agent === "copilot"),
    Hm = S.filter((s) => s.agent === "hermes"),
    Jc = S.filter((s) => s.agent === "jcode");
  const tiles = [
    ["Tổng token", fmt(T(S, "total")), `${fmt(T(S, "calls"))} lượt gọi đã biết`, per.map((p) => sum(AGENTS, (a) => p[a])), "var(--text)"],
    ["Claude", fmt(T(Cl, "total")), `${Cl.length} phần phiên`, per.map((p) => p.claude), COL.claude, "claude"],
    ["Codex", fmt(T(Cx, "total")), `${Cx.length} phần phiên`, per.map((p) => p.codex), COL.codex, "codex"],
    ["Copilot", fmt(T(Cp, "total")), `${Cp.length} phiên, ${fmt(T(Cp, "prem"))} premium request`, per.map((p) => p.copilot), COL.copilot, "copilot"],
    ["Hermes", fmt(T(Hm, "total")), `${sessionCount(Hm)} phiên, chỉ có tổng phiên`, per.map((p) => p.hermes), COL.hermes, "hermes"],
    ["jcode", fmt(T(Jc, "total")), `${sessionCount(Jc)} phiên`, per.map((p) => p.jcode), COL.jcode, "jcode"],
    [
      "Chưa phân bổ vào Run",
      fmt(
        T(
          S.filter((s) => !s.run_id),
          "total",
        ),
      ),
      `${pct(
        T(
          S.filter((s) => s.run_id),
          "total",
        ),
        T(S, "total"),
      )} đã phân bổ`,
      per.map(() => 0),
      "var(--yellow)",
    ],
    ["Output", fmt(T(S, "out")), `reasoning ${fmt(T(S, "reason"))}`, per.map((p) => p.parts[3]), COL.out],
    ["Phiên hoạt động", String(sessionCount(S)), `trung vị ${fmt(median(S.map((s) => s.total)))} token mỗi phần phiên`, per.map((p) => p.n), "var(--sky)"],
  ].filter((t) => !t[5] || ags.includes(t[5]));
  $("#kpi").innerHTML = tiles
    .map(
      ([h, big, sub, vals, c]) =>
        `<article class="card tile"><h4>${esc(h)}</h4><span class="big">${esc(big)}</span><span class="muted small">${esc(sub)}</span>${spark(vals, c)}</article>`,
    )
    .join("");
  const unit = d.days === 1 ? "giờ" : "ngày";
  let W = widthOf("#c-daily");
  fig("#c-daily", {
    title: `Token mỗi ${unit} theo agent`,
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
    caption: "Tổng token (input mới, cache đọc, cache ghi, output) theo giờ máy. Bấm một màu để lọc theo agent.",
  });
  // token composition per agent
  W = widthOf("#c-parts");
  const groups = ags.map((a) => [a, S.filter((s) => s.agent === a)]);
  const side = W >= 440,
    r = Math.min(90, side ? W / groups.length / 2 - 24 : W / 2 - 30),
    H = side ? 2 * r + 40 : groups.length * (2 * r + 40);
  const pg = groups
    .map(([a, X], i) => {
      const cx = side ? (W / groups.length) * (i + 0.5) : W / 2,
        cy = side ? r + 8 : i * (2 * r + 40) + r + 8;
      return (
        donut(
          PARTS.map(([k, n]) => ({ name: n, v: T(X, k), color: COL[k] })),
          r1(cx),
          r1(cy),
          r,
          AG[a],
          AG[a],
        ) + `<text x="${r1(cx)}" y="${r1(cy + r + 24)}" text-anchor="middle"${A({ f: "agent:" + a, tip: [AG[a], "Bấm để lọc"] })} class="v">${AG[a]}</text>`
      );
    })
    .join("");
  fig("#c-parts", {
    title: "Thành phần token theo agent",
    body: S.length ? svg(W, H, "Donut thành phần token của từng agent", pg) : "",
    legend: partLegend(),
    caption: "Cache đọc thường chiếm phần lớn: model đọc lại context đã cache ở mỗi lượt.",
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
  const mr = Math.min(100, W / 2 - 20);
  fig("#c-mix", {
    title: "Model và effort",
    body: rows.length
      ? svg(
          W,
          2 * mr + 16,
          "Donut tỷ lệ token theo model và effort",
          donut(
            rows.map(([k, v]) => ({ name: mixName(k), v, color: mixCol(k), f: "agent:" + k.split("|")[0] })),
            r1(W / 2),
            mr + 8,
            mr,
            "Model / effort",
            "token",
          ),
        )
      : "",
    legend: rows.slice(0, 10).map(([k, v]) => ({ name: mixName(k) + " " + pct(v, tot), color: mixCol(k), f: "agent:" + k.split("|")[0] })),
    caption: "Mỗi agent một màu, đậm nhạt theo thứ hạng model và effort của agent đó.",
  });
  $("#t-mix").innerHTML = rows.length
    ? `<table><thead><tr><th>Agent</th><th>Model</th><th>Effort</th><th class="num">Token</th><th class="num">Tỷ lệ</th></tr></thead><tbody>${rows
        .map(([k, v]) => {
          const [a, m, e] = k.split("|");
          return `<tr><td>${AG[a]}</td><td><code>${esc(m)}</code></td><td>${esc(e)}</td><td class="num">${fmt(v)}</td><td class="num">${pct(v, tot)}</td></tr>`;
        })
        .join("")}</tbody></table>`
    : '<p class="muted">Không có lượt gọi nào.</p>';
  // top 10
  const top = [...S].sort((a, b) => b.total - a.total).slice(0, 10);
  W = widthOf("#c-top");
  fig("#c-top", {
    title: "10 phiên tốn nhất theo token",
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
    caption: "Ô vuông đầu dòng là agent; thanh chia theo thành phần token. Bấm một thanh để mở chi tiết phiên.",
  });
  $("#t-top").innerHTML = top.length
    ? `<table><thead><tr><th>Bắt đầu</th><th>Agent</th><th>Repo / worktree</th><th>Vai</th><th>Model</th><th class="num">Token</th></tr></thead><tbody>${top.map((s) => `<tr class="click" tabindex="0" data-sid="${esc(s.id)}"><td class="nowrap">${dt(s.start)}</td><td>${AG[s.agent]}</td><td>${esc(s.repo)} / ${esc(s.worktree)}</td><td>${s.role ? esc(s.role) : ""}</td><td><code>${esc(s.model)}</code></td><td class="num">${fmt(s.total)}</td></tr>`).join("")}</tbody></table>`
    : '<p class="muted">Không có phiên nào.</p>';
}
