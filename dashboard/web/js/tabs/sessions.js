import * as C from "../lib/charts.js";
import {
  $, esc, AG, AGENTS, zeroAg, COL, PARTS, GROUPS, ROLE_SRC, GATE, groupOf, roleCol,
  buildMixColours, mixCol, mixName, fmt, usd, pct, pad, dt, hm, dm, dur, median, sum,
  costCell, cut, r1, splitWhy, sessionsF, agentsF, buckets, bval, A, svg, fill, widthOf,
  fig, agentLegend, partLegend, groupLegend, scale, timeTicks, yAxis, vBars, hBars,
  arcPath, donut, squarify, spark, mixc, gantt, hideTip
} from "../lib/charts.js";

const COLS = [
  ["start", "Bắt đầu", s => dt(s.start) + (s.split ? ` <span class="warn-dot" title="${esc(s.split)}" aria-label="${esc(s.split)}"></span>` : "")], ["agent", "Agent", s => AG[s.agent]], ["repo", "Repo"], ["worktree", "Worktree"], ["role", "Vai"],
  ["model", "Model", s => `<code>${esc(s.model)}</code>`], ["effort", "Effort"], ["calls", "Lượt", null, 1], ["fin", "Input mới", null, 1], ["cr", "Cache đọc", null, 1],
  ["cw", "Cache ghi", null, 1], ["out", "Output", null, 1], ["reason", "Reasoning", null, 1], ["ctx_med", "Ctx trung vị", null, 1], ["ctx_max", "Ctx max", null, 1],
  ["duration", "Thời lượng", s => dur(s.end - s.start), 1], ["cost", "Chi phí", costCell, 1], ["prem", "Premium req", s => s.agent === "copilot" ? fmt(s.prem) : "", 1], ["originator", "Nguồn"],
];
export function sessionRow(s, cells) {
  return `<tr class="click" tabindex="0" data-sid="${esc(s.id)}">${cells}</tr>`;
}
export function renderSessions(S) {
  S = S || sessionsF();
  const d = C.state.data;
  // scatter: x = first call in range, y = tokens (log), size = calls, colour = agent
  let W = widthOf("#c-scatter");
  const H = 340, L = 64, R = 16, T = 16, B = 44, pw = W - L - R, ph = H - T - B, g = [];
  const t0 = d.range_start, t1 = d.generated_at;
  const lo = Math.floor(Math.log10(Math.max(1, Math.min(...S.map(s => s.total), 1e12)))), hi = Math.ceil(Math.log10(Math.max(10, ...S.map(s => s.total))));
  const top = Math.max(hi, lo + 1), X = t => r1(L + pw * (Math.min(Math.max(t, t0), t1) - t0) / (t1 - t0)), Y = v => r1(T + ph - ph * (Math.log10(Math.max(1, v)) - lo) / (top - lo));
  for (let p = lo; p <= top; p++) g.push(`<line class="gl" x1="${L}" x2="${W - R}" y1="${Y(Math.pow(10, p))}" y2="${Y(Math.pow(10, p))}"/><text x="${L - 8}" y="${Y(Math.pow(10, p)) + 4}" text-anchor="end">${fmt(Math.pow(10, p))}</text>`);
  timeTicks(t0, t1, Math.max(3, Math.floor(pw / 70))).forEach(([t, lab]) => g.push(`<text x="${X(t)}" y="${T + ph + 18}" text-anchor="middle">${lab}</text>`));
  const maxC = Math.max(1, ...S.map(s => s.calls));
  [...S].sort((a, b) => b.calls - a.calls).forEach(s => {
    const rad = r1(3 + 13 * Math.sqrt(s.calls / maxC));
    g.push(`<circle cx="${X(s.t0 || s.start)}" cy="${Y(s.total)}" r="${rad}" style="fill:${COL[s.agent]};stroke:var(--mantle);stroke-width:1"${A({ sid: s.id, tip: [AG[s.agent] + ": " + s.repo + " / " + s.worktree, "Vai: " + s.role, "Bắt đầu: " + dt(s.start), "Token: " + fmt(s.total), "Lượt gọi: " + s.calls, "Model: " + s.model + " / " + s.effort, "Bấm để xem chi tiết"] })}/>`);
  });
  g.push(`<line class="ax" x1="${L}" x2="${W - R}" y1="${T + ph}" y2="${T + ph}"/><text x="12" y="${T + ph / 2}" text-anchor="middle" transform="rotate(-90 12 ${T + ph / 2})">Token (thang log)</text><text x="${L + pw / 2}" y="${H - 4}" text-anchor="middle">Lượt gọi đầu tiên trong khoảng</text>`);
  fig("#c-scatter", { title: `${S.length} phiên theo thời gian`, body: S.length ? svg(W, H, "Biểu đồ chấm: phiên theo thời gian và token", g.join("")) : "", legend: agentLegend().concat([{ name: "Chấm to: nhiều lượt gọi", color: "var(--overlay2)" }]), caption: "Trục token theo thang log: mỗi vạch gấp 10 lần vạch dưới. Bấm một chấm để mở chi tiết phiên." });
  // heatmap: day x hour
  W = widthOf("#c-heat");
  const days = d.dates, cells = {}, ags = agentsF();
  S.forEach(s => Object.entries(s.hours || {}).forEach(([k, v]) => { const c = cells[k] = cells[k] || zeroAg(); c[s.agent] += v[0] + v[1] + v[2] + v[3]; }));
  const max = Math.max(1, ...Object.values(cells).map(c => sum(AGENTS, a => c[a])));
  const LW2 = 52, cw = (W - LW2 - 4) / 24, ch = Math.max(14, Math.min(26, cw)), H2 = 8 + days.length * ch + 36, hm2 = [];
  const lvl = v => v <= 0 ? 0 : Math.min(5, Math.ceil(5 * Math.sqrt(v / max)));
  const lcol = l => l ? mixc("var(--blue)", [0, 22, 40, 58, 78, 100][l]) : "var(--surface0)";
  days.forEach((k, i) => {
    const y = 8 + i * ch;
    hm2.push(`<text x="0" y="${r1(y + ch / 2 + 4)}">${k.slice(8)}/${k.slice(5, 7)}</text>`);
    for (let h = 0; h < 24; h++) {
      const c = cells[k + " " + pad(h)] || zeroAg(), v = sum(AGENTS, a => c[a]);
      hm2.push(`<rect x="${r1(LW2 + h * cw + 1)}" y="${r1(y + 1)}" width="${r1(cw - 2)}" height="${r1(ch - 2)}" rx="2" style="fill:${lcol(lvl(v))}"${A({ tip: [k.slice(8) + "/" + k.slice(5, 7) + " " + pad(h) + ":00 đến " + pad(h) + ":59", "Tổng: " + fmt(v) + " token"].concat(ags.length > 1 && v ? ags.map(a => AG[a] + ": " + fmt(c[a])) : []) })}/>`);
    }
  });
  for (let h = 0; h < 24; h += cw < 22 ? 3 : 1) hm2.push(`<text x="${r1(LW2 + h * cw + cw / 2)}" y="${r1(8 + days.length * ch + 16)}" text-anchor="middle">${pad(h)}</text>`);
  hm2.push(`<text x="${r1(LW2 + 12 * cw)}" y="${H2 - 4}" text-anchor="middle">Giờ trong ngày (giờ máy)</text>`);
  const steps = [1, 2, 3, 4, 5].map(l => ({ name: "đến " + fmt(max * Math.pow(l / 5, 2)), color: lcol(l) }));
  fig("#c-heat", { title: "Token theo ngày và giờ", body: S.length ? svg(W, H2, "Bản đồ nhiệt token theo ngày và giờ", hm2.join("")) : "", legend: [{ name: "0", color: "var(--surface0)" }].concat(steps), caption: "Mỗi ô là một giờ của một ngày; càng đậm càng nhiều token." });
  // table
  const q = C.state.q.toLowerCase();
  let X2 = S.map(s => Object.assign(s, { duration: (s.end || 0) - (s.start || 0) }));
  if (C.state.split) X2 = X2.filter(s => s.split);
  $("#tk-split").setAttribute("aria-pressed", String(C.state.split));
  if (q) X2 = X2.filter(s => [s.id, s.repo, s.worktree, s.role, s.model, s.effort, s.originator, s.task_title, s.agent].join(" ").toLowerCase().includes(q));
  const { key, dir } = C.state.sort;
  X2.sort((a, b) => (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0) * dir);
  $("#sessions").innerHTML = `<p class="muted small">${X2.length} phiên. Bấm tiêu đề cột để sắp xếp, bấm một dòng để xem chi tiết.</p><table><thead><tr>${COLS.map(([k, l, , n]) => `<th data-key="${k}" class="${n ? "num" : ""}" aria-sort="${k === key ? (dir > 0 ? "ascending" : "descending") : "none"}">${l}${k === key ? (dir > 0 ? " ↑" : " ↓") : ""}</th>`).join("")}</tr></thead><tbody>${X2.map(s => sessionRow(s, COLS.map(([k, , f, n]) => `<td class="${n ? "num" : ""}${k === "start" ? " nowrap" : ""}">${f ? f(s) : n ? fmt(s[k]) : esc(s[k])}</td>`).join(""))).join("")}</tbody></table>`;
}
export function showSession(id) {
  const d = C.state.data, s = d.sessions.find(x => x.id === id);
  if (!s) return;
  const run = s.run_id && (d.orca.runs || []).find(r => r.id === s.run_id);
  const mix = Object.entries(s.mix).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<code>${esc(k.replace("|", " / "))}</code> ${fmt(v)}`).join("<br>");
  const sk = Object.entries(s.skills).map(([k, v]) => `${esc(k)} x${v[0]}`).join(", ");
  const hk = Object.entries(s.hooks || {}).map(([k, v]) => esc(k) + (v ? ` (${esc(v)})` : "")).join(", ");
  const W = Math.max(280, Math.min(800, (typeof window !== "undefined" && window.innerWidth ? window.innerWidth : 860) - 80));
  const partsBar = hBars({ W, LW: 70, RW: 70, rows: [{ label: "Token", segs: PARTS.map(([k, n]) => ({ v: s[k], color: COL[k], name: n })) }], aria: "Thanh chia thành phần token của phiên" });
  const dk = Object.keys(s.days).sort();
  const daysBar = dk.length > 1 ? vBars({ W, H: 180, cats: dk.map(k => ({ label: k.slice(8) + "/" + k.slice(5, 7) })), series: PARTS.map(([k, n]) => ({ name: n, color: COL[k] })), get: (i, j) => s.days[dk[i]][j], fv: fmt, yTitle: "Token", aria: "Cột token theo ngày của phiên" }) : "";
  $("#detail-title").textContent = AG[s.agent] + ": " + s.repo + " / " + s.worktree;
  $("#detail-body").innerHTML = `<div class="chart">${partsBar}${daysBar}<ul class="legend">${partLegend().map(l => `<li><span class="swatch" style="--c:${l.color}"></span>${l.name}</li>`).join("")}</ul></div><dl class="kv">
    ${s.split ? `<dt>Nên tách</dt><dd>${esc(s.split)}. Nên mở phiên mới sau mỗi phần việc</dd>` : ""}
    <dt>Session id</dt><dd><code>${esc(s.id)}</code></dd>
    <dt>Thời gian</dt><dd>${dt(s.start)} đến ${dt(s.end)} (${dur(s.end - s.start)})</dd>
    ${s.branch ? `<dt>Nhánh</dt><dd>${esc(s.branch)}</dd>` : ""}
    ${s.role ? `<dt>Vai</dt><dd>${esc(s.role)} ${s.role_src ? `<span class="muted small">(từ ${ROLE_SRC[s.role_src] || s.role_src})</span>` : ""}</dd>` : ""}
    ${s.title ? `<dt>Title</dt><dd>${esc(s.title)}</dd>` : ""}
    ${s.task_id ? `<dt>Task Orca</dt><dd>${esc(s.task_title)} <code>${esc(s.task_id)}</code></dd>` : ""}
    ${run ? `<dt>Run</dt><dd>${esc(run.objective)}</dd>` : s.run_id ? `<dt>Run</dt><dd><code>${esc(s.run_id)}</code></dd>` : ""}
    <dt>Nguồn</dt><dd>${esc(s.originator)}</dd>
    <dt>Lượt gọi</dt><dd>${s.calls}, context trung vị ${fmt(s.ctx_med)}, lớn nhất ${fmt(s.ctx_max)}</dd>
    <dt>Token</dt><dd>input mới ${fmt(s.fin)}, cache đọc ${fmt(s.cr)}, cache ghi ${fmt(s.cw)}, output ${fmt(s.out)} (reasoning ${fmt(s.reason)}), tổng ${fmt(s.total)}</dd>
    <dt>Chi phí ước tính</dt><dd>${costCell(s)}${s.unpriced ? ` <span class="muted small">(${fmt(s.unpriced)} token chưa có giá)</span>` : ""}${s.agent === "copilot" ? ' <span class="muted small">(Copilot Free không tính tiền theo token)</span>' : ""}</dd>
    ${s.agent === "copilot" ? `<dt>Premium request</dt><dd>${fmt(s.prem)} trong khoảng${s.snapshot ? `, cả phiên ${fmt(s.snapshot.premium)} theo accountingSnapshot (${fmt(s.snapshot.requests)} lượt gọi)` : ""}</dd>` : ""}
    ${mix ? `<dt>Model / effort</dt><dd>${mix}</dd>` : ""}
    ${sk ? `<dt>Skills nạp</dt><dd>${sk}</dd>` : ""}
    ${hk ? `<dt>Skill qua hook</dt><dd>${hk}</dd>` : ""}
    ${s.preview ? `<dt>Prompt đầu (160 ký tự)</dt><dd>${esc(s.preview)}</dd>` : ""}</dl>`;
  $("#detail").showModal();
}

