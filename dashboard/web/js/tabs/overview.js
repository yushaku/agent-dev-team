import * as C from "../lib/charts.js";
import { initQuota } from "./quota.js";
import {
  $, esc, AG, AGENTS, zeroAg, COL, PARTS, GROUPS, ROLE_SRC, GATE, groupOf, roleCol,
  buildMixColours, mixCol, mixName, fmt, usd, pct, pad, dt, hm, dm, dur, median, sum,
  costCell, cut, r1, splitWhy, sessionsF, agentsF, buckets, bval, A, svg, fill, widthOf,
  fig, agentLegend, partLegend, groupLegend, scale, timeTicks, yAxis, vBars, hBars,
  arcPath, donut, squarify, spark, mixc, gantt, hideTip
} from "../lib/charts.js";

export function renderOverview(S) {
  const d = C.state.data;
  const f = [C.state.repo && "repo " + C.state.repo, C.state.wt && "worktree " + C.state.wt, C.state.role && "vai " + C.state.role, C.state.agent && "chỉ " + AG[C.state.agent]].filter(Boolean);
  $("#ov-lead").textContent = `Token Claude, Codex, Copilot và Hermes: ${d.days} ngày gần nhất (từ ${dt(d.range_start).slice(0, 5)}), ${S.length} phiên${f.length ? ", " + f.join(", ") : ""}.`;
  initQuota();
  renderLimit();
  const B = buckets(), ags = agentsF();
  const per = B.map(b => { const o = Object.assign(zeroAg(), { cost: zeroAg(), parts: [0, 0, 0, 0], n: 0, prem: 0 }); S.forEach(s => { const v = bval(s, b); if (!v) return; const t = v[0] + v[1] + v[2] + v[3]; o[s.agent] += t; o.cost[s.agent] += v[4]; o.prem += v[5] || 0; for (let i = 0; i < 4; i++) o.parts[i] += v[i]; o.n++; }); return o; });
  const T = (X, k) => sum(X, s => s[k]);
  const Cl = S.filter(s => s.agent === "claude"), Cx = S.filter(s => s.agent === "codex"), Cp = S.filter(s => s.agent === "copilot"), unp = T(S, "unpriced");
  const tiles = [
    ["Tổng token", fmt(T(S, "total")), `${fmt(T(S, "calls"))} lượt gọi`, per.map(p => sum(AGENTS, a => p[a])), "var(--text)"],
    ["Claude", fmt(T(Cl, "total")), `${Cl.length} phiên, ${usd(T(Cl, "cost"))}`, per.map(p => p.claude), COL.claude, "claude"],
    ["Codex", fmt(T(Cx, "total")), `${Cx.length} phiên, ${usd(T(Cx, "cost"))}`, per.map(p => p.codex), COL.codex, "codex"],
    ["Copilot", fmt(T(Cp, "total")), `${Cp.length} phiên, ${fmt(T(Cp, "prem"))} premium request, $0`, per.map(p => p.copilot), COL.copilot, "copilot"],
    ["Chi phí ước tính", usd(T(S, "cost")) + (unp ? " + ?" : ""), (unp ? `${fmt(unp)} token chưa có giá` : "theo prices.json") + (Cp.length ? ", Copilot tính $0" : ""), per.map(p => sum(AGENTS, a => p.cost[a])), "var(--yellow)"],
    ["Output", fmt(T(S, "out")), `reasoning ${fmt(T(S, "reason"))}`, per.map(p => p.parts[3]), COL.out],
    ["Phiên hoạt động", String(S.length), `trung vị ${fmt(median(S.map(s => s.total)))} token mỗi phiên`, per.map(p => p.n), "var(--sky)"],
  ].filter(t => !t[5] || ags.includes(t[5]));
  $("#kpi").innerHTML = tiles.map(([h, big, sub, vals, c]) => `<article class="card tile"><h4>${esc(h)}</h4><span class="big">${esc(big)}</span><span class="muted small">${esc(sub)}</span>${spark(vals, c)}</article>`).join("");
  const unit = d.days === 1 ? "giờ" : "ngày";
  let W = widthOf("#c-daily");
  fig("#c-daily", { title: `Token mỗi ${unit} theo agent`, body: S.length ? vBars({ W, cats: B, series: ags.map(a => ({ name: AG[a], color: COL[a], f: "agent:" + a })), get: (i, j) => per[i][ags[j]], fv: v => fmt(v) + " token", yTitle: "Token", xTitle: d.days === 1 ? "Giờ trong ngày" : "Ngày", aria: "Cột chồng token mỗi " + unit + " theo agent" }) : "", legend: agentLegend(), caption: "Tổng token (input mới, cache đọc, cache ghi, output) theo giờ máy. Bấm một màu để lọc theo agent." });
  W = widthOf("#c-cost");
  fig("#c-cost", { title: `Chi phí ước tính mỗi ${unit}`, body: S.length ? vBars({ W, cats: B, series: ags.map(a => ({ name: AG[a], color: COL[a], f: "agent:" + a })), get: (i, j) => per[i].cost[ags[j]], fv: usd, fy: v => "$" + fmt(v), yTitle: "USD", xTitle: d.days === 1 ? "Giờ trong ngày" : "Ngày", aria: "Cột chi phí mỗi " + unit }) : "", legend: agentLegend(), caption: "USD theo giá giả định trong prices.json; model chưa có giá không được cộng. Copilot Free không tính tiền theo token nên luôn $0, xem premium request ở thẻ Copilot." });
  // token composition per agent
  W = widthOf("#c-parts");
  const groups = ags.map(a => [a, S.filter(s => s.agent === a)]);
  const side = W >= 440, r = Math.min(90, side ? (W / groups.length) / 2 - 24 : W / 2 - 30), H = side ? 2 * r + 40 : groups.length * (2 * r + 40);
  const pg = groups.map(([a, X], i) => {
    const cx = side ? W / groups.length * (i + 0.5) : W / 2, cy = side ? r + 8 : i * (2 * r + 40) + r + 8;
    return donut(PARTS.map(([k, n]) => ({ name: n, v: T(X, k), color: COL[k] })), r1(cx), r1(cy), r, AG[a], AG[a]) + `<text x="${r1(cx)}" y="${r1(cy + r + 24)}" text-anchor="middle"${A({ f: "agent:" + a, tip: [AG[a], "Bấm để lọc"] })} class="v">${AG[a]}</text>`;
  }).join("");
  fig("#c-parts", { title: "Thành phần token theo agent", body: S.length ? svg(W, H, "Donut thành phần token của từng agent", pg) : "", legend: partLegend(), caption: "Cache đọc thường chiếm phần lớn: model đọc lại context đã cache ở mỗi lượt." });
  // model + effort mix
  const mix = {};
  S.forEach(s => Object.entries(s.mix).forEach(([k, v]) => { const key = s.agent + "|" + k; mix[key] = (mix[key] || 0) + v; }));
  const rows = Object.entries(mix).sort((a, b) => b[1] - a[1]), tot = sum(rows, x => x[1]);
  W = widthOf("#c-mix");
  const mr = Math.min(100, W / 2 - 20);
  fig("#c-mix", { title: "Model và effort", body: rows.length ? svg(W, 2 * mr + 16, "Donut tỷ lệ token theo model và effort", donut(rows.map(([k, v]) => ({ name: mixName(k), v, color: mixCol(k), f: "agent:" + k.split("|")[0] })), r1(W / 2), mr + 8, mr, "Model / effort", "token")) : "", legend: rows.slice(0, 10).map(([k, v]) => ({ name: mixName(k) + " " + pct(v, tot), color: mixCol(k), f: "agent:" + k.split("|")[0] })), caption: "Mỗi agent một màu, đậm nhạt theo thứ hạng model và effort của agent đó." });
  $("#t-mix").innerHTML = rows.length ? `<table><thead><tr><th>Agent</th><th>Model</th><th>Effort</th><th class="num">Token</th><th class="num">Tỷ lệ</th></tr></thead><tbody>${rows.map(([k, v]) => { const [a, m, e] = k.split("|"); return `<tr><td>${AG[a]}</td><td><code>${esc(m)}</code></td><td>${esc(e)}</td><td class="num">${fmt(v)}</td><td class="num">${pct(v, tot)}</td></tr>`; }).join("")}</tbody></table>` : '<p class="muted">Không có lượt gọi nào.</p>';
  // top 10
  const top = [...S].sort((a, b) => b.total - a.total).slice(0, 10);
  W = widthOf("#c-top");
  fig("#c-top", { title: "10 phiên tốn nhất theo token", body: top.length ? hBars({ W, LW: 280, RW: 120, rows: top.map(s => ({ label: `${s.repo}/${s.worktree}${s.role ? ", " + s.role : ""}`, full: `${AG[s.agent]}: ${s.repo} / ${s.worktree}${s.role ? ", vai " + s.role : ""}, ${dt(s.start)}`, dot: COL[s.agent], sid: s.id, segs: PARTS.map(([k, n]) => ({ v: s[k], color: COL[k], name: n })), right: [{ t: fmt(s.total) }, { t: costCell(s), color: "var(--subtext0)" }] })), xTitle: "Token", aria: "Thanh ngang 10 phiên tốn nhất" }) : "", legend: agentLegend().concat(partLegend()), caption: "Ô vuông đầu dòng là agent; thanh chia theo thành phần token. Bấm một thanh để mở chi tiết phiên." });
  $("#t-top").innerHTML = top.length ? `<table><thead><tr><th>Bắt đầu</th><th>Agent</th><th>Repo / worktree</th><th>Vai</th><th>Model</th><th class="num">Token</th><th class="num">Chi phí</th></tr></thead><tbody>${top.map(s => `<tr class="click" tabindex="0" data-sid="${esc(s.id)}"><td class="nowrap">${dt(s.start)}</td><td>${AG[s.agent]}</td><td>${esc(s.repo)} / ${esc(s.worktree)}</td><td>${s.role ? esc(s.role) : ""}</td><td><code>${esc(s.model)}</code></td><td class="num">${fmt(s.total)}</td><td class="num">${costCell(s)}</td></tr>`).join("")}</tbody></table>` : '<p class="muted">Không có phiên nào.</p>';
}

function renderLimit() {
  const d = C.state.data, L = d.codex_limit, now = d.generated_at;
  if (!L) { fig("#c-gauge", { title: "Đã dùng", empty: "Chưa có mẫu hạn mức tuần nào trong log Codex." }); fig("#c-limit", { title: "% đã dùng từ lần reset", empty: "Chưa có mẫu." }); return; }
  const span = L.resets_at - L.window_start, elapsed = Math.min(100, Math.max(0, (now - L.window_start) / span * 100));
  const risk = L.hits_before_reset, warn = !risk && L.projected_hit && L.projected_hit - L.resets_at < 86400;
  const c = risk ? "var(--red)" : warn ? "var(--yellow)" : "var(--green)";
  const status = risk ? "Sẽ chạm 100% trước reset" : warn ? "Sát ngưỡng" : "Đủ đến lúc reset";
  // gauge: 270 degree arc, coloured by status, tick at elapsed time
  let W = widthOf("#c-gauge"); const r = Math.min(110, W / 2 - 30), cx = W / 2, cy = r + 16, a0 = Math.PI * 0.75, span270 = Math.PI * 1.5;
  const ang = p => a0 + span270 * Math.min(100, Math.max(0, p)) / 100;
  const tick = (p, len, cls) => { const a = ang(p); return `<line x1="${r1(cx + (r + 4) * Math.cos(a))}" y1="${r1(cy + (r + 4) * Math.sin(a))}" x2="${r1(cx + (r - len) * Math.cos(a))}" y2="${r1(cy + (r - len) * Math.sin(a))}" ${cls}/>`; };
  let g = `<path d="${arcPath(cx, cy, r, r * 0.78, a0, a0 + span270)}" style="fill:var(--surface0)"${A({ tip: ["Còn lại: " + (100 - L.used).toFixed(0) + "%"] })}/>`;
  if (L.used > 0) g += `<path d="${arcPath(cx, cy, r, r * 0.78, a0, ang(L.used))}" style="fill:${c}"${A({ tip: ["Đã dùng: " + L.used.toFixed(1) + "%", status, "Mẫu lúc " + dt(L.sample_at)] })}/>`;
  g += tick(elapsed, r * 0.3, 'style="stroke:var(--text);stroke-width:3"') + `<circle cx="${r1(cx + (r + 10) * Math.cos(ang(elapsed)))}" cy="${r1(cy + (r + 10) * Math.sin(ang(elapsed)))}" r="8" style="fill:transparent"${A({ tip: ["Thời gian đã qua của tuần: " + elapsed.toFixed(0) + "%", "Thanh màu vượt vạch là đang dùng nhanh hơn nhịp đều"] })}/>`;
  [0, 50, 100].forEach(p => { const a = ang(p); g += `<text x="${r1(cx + (r + 18) * Math.cos(a))}" y="${r1(cy + (r + 18) * Math.sin(a) + 4)}" text-anchor="middle">${p}%</text>`; });
  g += `<text x="${cx}" y="${cy + 6}" text-anchor="middle" class="big">${L.used.toFixed(0)}%</text><text x="${cx}" y="${cy + 28}" text-anchor="middle">đã dùng, gói ${esc(L.plan || "?")}</text>`;
  g += `<text x="${cx}" y="${cy + r * 0.72 + 22}" text-anchor="middle" style="fill:${c};font-weight:600">${esc(status)}</text>`;
  const left = (L.resets_at - now) / 86400;
  fig("#c-gauge", { title: "Đã dùng trong tuần", body: svg(W, cy + r * 0.72 + 34, "Đồng hồ: Codex đã dùng " + L.used.toFixed(0) + " phần trăm hạn mức tuần, " + status, g),
    legend: [{ name: "Đã dùng (" + (risk ? "đỏ: sẽ chạm trước reset" : warn ? "vàng: sát ngưỡng" : "xanh: đủ") + ")", color: c }, { name: "Vạch sáng: thời gian đã qua " + elapsed.toFixed(0) + "%", color: "var(--text)" }],
    caption: `Reset ${dt(L.resets_at)} (còn ${left.toFixed(1)} ngày). Nhịp ${L.pace_per_day.toFixed(1)}% mỗi ngày${L.stale ? ". Cửa sổ đã reset, chưa có mẫu mới" : ""}.` });
  // used % line since reset, projection, reset marker, red zone
  W = widthOf("#c-limit");
  const H = 260, Lm = 48, R = 16, T = 20, Bm = 40, pw = W - Lm - R, ph = H - T - Bm;
  const t0 = L.window_start, t1 = L.resets_at + span * 0.04;
  const X = t => r1(Lm + pw * (t - t0) / (t1 - t0)), Y = p => r1(T + ph - ph * Math.min(110, p) / 100);
  const gl = [];
  [0, 25, 50, 75, 100].forEach(p => gl.push(`<line class="gl" x1="${Lm}" x2="${W - R}" y1="${Y(p)}" y2="${Y(p)}"/><text x="${Lm - 8}" y="${Y(p) + 4}" text-anchor="end">${p}%</text>`));
  timeTicks(t0, L.resets_at, Math.max(3, Math.floor(pw / 70))).forEach(([t, lab]) => gl.push(`<text x="${X(t)}" y="${T + ph + 18}" text-anchor="middle">${lab}</text>`));
  const hit = L.projected_hit;
  if (risk) gl.push(`<rect x="${X(hit)}" y="${T}" width="${r1(X(L.resets_at) - X(hit))}" height="${ph}" style="fill:${mixc("var(--red)", 22)}"${A({ tip: ["Vùng đỏ: hết hạn mức", "Dự kiến chạm 100% lúc " + dt(hit), "Reset lúc " + dt(L.resets_at)] })}/>`);
  gl.push(`<line x1="${X(t0)}" y1="${Y(0)}" x2="${X(L.resets_at)}" y2="${Y(100)}" style="stroke:var(--overlay0);stroke-width:1;stroke-dasharray:2 4"/>`);
  const H0 = (L.history || []).filter(p => p[0] >= t0);
  const pts = H0.length ? H0 : [[L.sample_at, L.used]];
  if (pts.length) {
    gl.push(`<polyline points="${X(t0)},${Y(0)} ${pts.map(p => X(p[0]) + "," + Y(p[1])).join(" ")}" style="fill:none;stroke:var(--blue);stroke-width:2"/>`);
    const last = pts[pts.length - 1], endT = hit && hit < L.resets_at ? hit : L.resets_at, endP = hit && hit < L.resets_at ? 100 : last[1] + L.pace_per_day * (L.resets_at - last[0]) / 86400;
    if (L.pace_per_day > 0) gl.push(`<line x1="${X(last[0])}" y1="${Y(last[1])}" x2="${X(endT)}" y2="${Y(endP)}" style="stroke:${c};stroke-width:2;stroke-dasharray:6 4"${A({ tip: ["Dự kiến theo nhịp " + L.pace_per_day.toFixed(1) + "% mỗi ngày", hit ? "Chạm 100% lúc " + dt(hit) : "Không chạm 100%"] })}/>`);
    if (risk) gl.push(`<circle cx="${X(hit)}" cy="${Y(100)}" r="5" style="fill:var(--red)"${A({ tip: ["Dự kiến chạm 100%", dt(hit)] })}/>`);
    const every = Math.max(1, Math.ceil(pts.length / 120));
    pts.forEach((p, i) => { if (i % every === 0 || i === pts.length - 1) gl.push(`<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="${i === pts.length - 1 ? 4 : 6}" style="fill:${i === pts.length - 1 ? "var(--blue)" : "transparent"}"${A({ tip: [dt(p[0]), "Đã dùng: " + p[1] + "%"] })}/>`); });
  }
  gl.push(`<line x1="${X(now)}" x2="${X(now)}" y1="${T}" y2="${T + ph}" style="stroke:var(--overlay2);stroke-width:1;stroke-dasharray:3 3"/><text x="${X(now)}" y="${T - 6}" text-anchor="middle">bây giờ</text>`);
  gl.push(`<line x1="${X(L.resets_at)}" x2="${X(L.resets_at)}" y1="${T}" y2="${T + ph}" style="stroke:var(--text);stroke-width:2"${A({ tip: ["Reset lúc " + dt(L.resets_at)] })}/><text x="${X(L.resets_at)}" y="${T - 6}" text-anchor="end" class="v">reset ${dt(L.resets_at)}</text>`);
  gl.push(`<line class="ax" x1="${Lm}" x2="${W - R}" y1="${T + ph}" y2="${T + ph}"/><text x="12" y="${T + ph / 2}" text-anchor="middle" transform="rotate(-90 12 ${T + ph / 2})">% đã dùng</text><text x="${Lm + pw / 2}" y="${H - 4}" text-anchor="middle">Thời gian từ lần reset trước</text>`);
  fig("#c-limit", { title: "% đã dùng từ lần reset", body: svg(W, H, "Đường phần trăm hạn mức Codex đã dùng từ lần reset, kèm đường dự kiến", gl.join("")),
    legend: [{ name: "Đã dùng (mẫu trong log)", color: "var(--blue)" }, { name: "Dự kiến theo nhịp hiện tại", color: c }, { name: "Nhịp đều đến reset", color: "var(--overlay0)" }].concat(risk ? [{ name: "Vùng đỏ: hết hạn mức trước reset", color: mixc("var(--red)", 22) }] : []),
    caption: `${H0.length} mẫu từ ${dt(t0)}. Vạch đậm là lúc reset; vạch đứt mảnh là bây giờ.` });
}

/* ---------- Theo vai ---------- */
