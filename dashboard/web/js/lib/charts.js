/* Token dashboard tab: Claude, Codex, GitHub Copilot CLI and Orca usage from GET /api/data (ported from the old dashboard page). */
export const $ = s => document.querySelector(s);
export const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const AG = { claude: "Claude", codex: "Codex", copilot: "Copilot", hermes: "Hermes" };
export const AGENTS = ["claude", "codex", "copilot", "hermes"];
export const zeroAg = () => ({ claude: 0, codex: 0, copilot: 0, hermes: 0 });
export const state = { split: false, days: 7, repo: "", agent: "", role: "", wt: "", runF: "", taskF: "", run: "", data: null, auto: true, sort: { key: "start", dir: -1 }, q: "", timer: null };
try { const s = JSON.parse(localStorage.getItem("team-dashboard") || "{}"); Object.assign(state, { days: s.days || 7, repo: s.repo || "", agent: s.agent || "", role: s.role || "", wt: s.wt || "", runF: s.runF || "", taskF: s.taskF || "", auto: s.auto !== false }); } catch (e) {}
export const persist = () => { try { localStorage.setItem("team-dashboard", JSON.stringify({ days: state.days, repo: state.repo, agent: state.agent, role: state.role, wt: state.wt, runF: state.runF, taskF: state.taskF, auto: state.auto })); } catch (e) {} };

/* ---------- colours: one meaning each ---------- */
export const COL = { claude: "var(--claude)", codex: "var(--codex)", copilot: "var(--copilot)", hermes: "var(--hermes)", fin: "var(--p-fin)", cr: "var(--p-cr)", cw: "var(--p-cw)", out: "var(--p-out)" };
export const PARTS = [["fin", "Input mới"], ["cr", "Cache đọc"], ["cw", "Cache ghi"], ["out", "Output"]];
export const GROUPS = { po: ["PO", "var(--sky)"], orch: ["Orchestrator", "var(--blue)"], plan: ["Plan", "var(--mauve)"], build: ["Build", "var(--green)"], verify: ["Verify", "var(--peach)"], delivery: ["Delivery", "var(--pink)"], direct: ["Chat trực tiếp", "var(--overlay0)"], other: ["Khác", "var(--overlay2)"] };
export const ROLE_GROUP = { po: "po", orchestrator: "orch", designer: "plan", architect: "plan", "solution-architect": "plan", "tech-lead": "plan", researcher: "plan", builder: "build", "anti-ai": "verify", qa: "verify", reviewer: "verify", security: "verify", "perf-a11y": "verify", "doc-keeper": "delivery", delivery: "delivery", "chat trực tiếp": "direct" };
export const ROLE_SRC = { orca: "task Orca", "role-line": "dòng Role:", dispatch: "lệnh giao việc Orca", title: "title", skill: "skill" };
export const groupOf = r => ROLE_GROUP[r] || "other";
export const roleCol = r => GROUPS[groupOf(r)][1];
export const GATE = { approve: ["Duyệt", "var(--green)"], changes: ["Yêu cầu sửa", "var(--yellow)"], other: ["Khác", "var(--blue)"], pending: ["Đang chờ", "var(--overlay2)"] };
export const mixc = (c, p) => p >= 100 ? c : `color-mix(in srgb, ${c} ${p}%, var(--mantle))`;
export let MIXCOL = {};
export function buildMixColours() { // stable across filters: rank model+effort keys per agent on the full data
  const tot = {};
  state.data.sessions.forEach(s => Object.entries(s.mix).forEach(([k, v]) => { const key = s.agent + "|" + k; tot[key] = (tot[key] || 0) + v; }));
  MIXCOL = {};
  AGENTS.forEach(a => Object.keys(tot).filter(k => k.startsWith(a + "|")).sort((x, y) => tot[y] - tot[x])
    .forEach((k, i) => { MIXCOL[k] = mixc(COL[a], [100, 70, 48, 32][Math.min(i, 3)]); }));
}
export const mixCol = k => MIXCOL[k] || "var(--overlay0)";
export const mixName = k => { const [a, m, e] = k.split("|"); return `${AG[a] || a}: ${m} / ${e}`; };

/* ---------- formatting ---------- */
export function fmt(n) {
  if (n == null || isNaN(n)) return "?";
  const a = Math.abs(n);
  if (a >= 1e9) return +(n / 1e9).toFixed(a >= 1e10 ? 0 : 1) + "B";
  if (a >= 1e6) return +(n / 1e6).toFixed(a >= 1e7 ? 0 : 1) + "M";
  if (a >= 1e3) return +(n / 1e3).toFixed(a >= 1e4 ? 0 : 1) + "K";
  return String(Math.round(n));
}
export const usd = n => "$" + (n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2));
export const pct = (a, b) => b ? (100 * a / b).toFixed(1) + "%" : "0%";
export const pad = n => String(n).padStart(2, "0");
export const dt = ts => { if (!ts) return "?"; const d = new Date(ts * 1000); return pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()); };
export const hm = ts => { const d = new Date(ts * 1000); return pad(d.getHours()) + ":" + pad(d.getMinutes()); };
export const dm = ts => { const d = new Date(ts * 1000); return pad(d.getDate()) + "/" + pad(d.getMonth() + 1); };
export const dur = s => { if (!s || s < 0) return "0 ph"; const m = Math.round(s / 60); return m < 60 ? m + " ph" : Math.floor(m / 60) + " g " + (m % 60) + " ph"; };
export const median = a => { if (!a.length) return 0; const b = [...a].sort((x, y) => x - y); const m = b.length >> 1; return b.length % 2 ? b[m] : Math.round((b[m - 1] + b[m]) / 2); };
export const sum = (a, f) => a.reduce((t, x) => t + (f(x) || 0), 0);
export const costCell = s => s.agent === "copilot" ? "$0" : s.unpriced > 0 ? (s.cost > 0 ? usd(s.cost) + " + ?" : "?") : usd(s.cost);
export const cut = (s, n) => { s = String(s || ""); return s.length > n ? s.slice(0, Math.max(1, n - 1)) + "…" : s; };
export const r1 = n => Math.round(n * 10) / 10;

/* ---------- data ---------- */
/* Split hint: a session should have been split when it burns many tokens or its context stays large. */
export const SPLIT_TOTAL = 20e6, SPLIT_CTX = 150e3;
export function splitWhy(s) { // Hermes stores one aggregate call, so ctx_* only counts when calls > 1
  const r = [];
  if (s.total >= SPLIT_TOTAL) r.push(`Tốn ${+(s.total / 1e6).toFixed(1)}M token`);
  if (s.calls > 1 && s.ctx_med >= SPLIT_CTX) r.push(`Context trung vị ${Math.round(s.ctx_med / 1e3)}k`);
  return r.join(", ");
}
export function sessionsF() {
  return state.data.sessions.filter(s => (!state.repo || s.repo === state.repo) && (!state.agent || s.agent === state.agent)
    && (!state.role || s.role === state.role) && (!state.wt || s.worktree === state.wt)
    && (!state.runF || s.run_id === state.runF) && (!state.taskF || s.task_id === state.taskF));
}
export const agentsF = () => AGENTS.filter(a => !state.agent || a === state.agent);
/* Buckets: hours for a 1 day range, days otherwise. Each value is [fin, cr, cw, out, cost]. */
export function buckets() {
  const d = state.data;
  if (d.days === 1) return Array.from({ length: 24 }, (_, h) => ({ k: d.dates[0] + " " + pad(h), label: pad(h) + "h", long: d.dates[0].slice(8) + "/" + d.dates[0].slice(5, 7) + " " + pad(h) + ":00", src: "hours" }));
  return d.dates.map(k => ({ k, label: k.slice(8) + "/" + k.slice(5, 7), long: k.slice(8) + "/" + k.slice(5, 7) + "/" + k.slice(0, 4), src: "days" }));
}
export const bval = (s, b) => (s[b.src] && s[b.src][b.k]) || null;

/* ---------- SVG kit ---------- */
/* Interactive attributes: tooltip lines, cross filter, session, run. */
export function A(o) {
  let s = "";
  if (o.tip) s += ` data-tip="${esc(o.tip.filter(x => x != null && x !== "").join("\n"))}"`;
  if (o.f) s += ` data-f="${esc(o.f)}"`;
  if (o.sid) s += ` data-sid="${esc(o.sid)}"`;
  if (o.run) s += ` data-run="${esc(o.run)}"`;
  if (o.skill) s += ` data-skill="${esc(o.skill)}"`;
  if (o.pressed != null) s += ` aria-pressed="${o.pressed}"`;
  if (o.f || o.sid || o.run || o.skill) s += ` tabindex="0" role="button" aria-label="${esc((o.tip || [o.f || o.sid || o.run || o.skill]).join(", "))}"`;
  return s;
}
export const svg = (W, H, label, inner) => `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(label)}">${inner}</svg>`;
export const fill = c => `style="fill:${c}"`;
export function widthOf(id) {
  const el = $(id);
  let padX = 48;
  try { const cs = getComputedStyle(el); padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth); } catch (e) {}
  const w = el && el.clientWidth ? el.clientWidth - padX : 900;
  return Math.max(280, Math.round(w));
}
export function fig(id, o) {
  const el = $(id);
  if (!el) return;
  const legend = (o.legend || []).map(l => `<li${l.f ? A({ f: l.f, tip: [l.name, "Bấm để lọc"] }) : ""}><span class="swatch" style="--c:${l.color}"></span>${esc(l.name)}</li>`).join("");
  el.innerHTML = `<h4>${esc(o.title)}</h4>${o.body ? `<div class="chart-scroll">${o.body}</div>` : `<p class="empty">${esc(o.empty || "Không có dữ liệu trong khoảng này.")}</p>`}${legend ? `<ul class="legend">${legend}</ul>` : ""}${o.caption ? `<figcaption>${o.caption}</figcaption>` : ""}`;
}
export const agentLegend = () => agentsF().map(a => ({ name: AG[a], color: COL[a], f: "agent:" + a }));
export const partLegend = () => PARTS.map(([k, n]) => ({ name: n, color: COL[k] }));
export const groupLegend = gs => gs.map(g => ({ name: GROUPS[g][0], color: GROUPS[g][1] }));
export function scale(max, n = 4) {
  if (!(max > 0)) max = 1;
  const raw = max / n, p = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * p).find(v => v >= raw);
  const top = Math.ceil(max / step - 1e-9) * step, ticks = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(v);
  return { top, ticks };
}
/* Local time ticks aligned to round hours or midnight. */
export function timeTicks(t0, t1, maxN) {
  const steps = [900, 1800, 3600, 7200, 10800, 21600, 43200, 86400, 172800, 604800];
  const step = steps.find(s => (t1 - t0) / s <= maxN) || 604800;
  const L = -new Date(t0 * 1000).getTimezoneOffset() * 60;
  const out = [];
  for (let t = Math.ceil((t0 + L) / step) * step - L; t <= t1; t += step) {
    const mid = new Date(t * 1000).getHours() === 0;
    out.push([t, step >= 86400 || (mid && step < 86400) ? dm(t) : hm(t)]);
  }
  return out;
}
export function yAxis(g, { L, R, T, ph, W, top, ticks, f, title }) {
  ticks.forEach(v => { const y = r1(T + ph - ph * v / top); g.push(`<line class="gl" x1="${L}" x2="${W - R}" y1="${y}" y2="${y}"/><text x="${L - 8}" y="${y + 4}" text-anchor="end">${f(v)}</text>`); });
  if (title) g.push(`<text x="12" y="${T + ph / 2}" text-anchor="middle" transform="rotate(-90 12 ${T + ph / 2})">${esc(title)}</text>`);
}
/* Stacked vertical bars. o: { W, H, cats:[{label,long,run}], series:[{name,color,f}], get(ci,si), fv, yTitle, xTitle, aria } */
export function vBars(o) {
  const W = o.W, H = o.H || 260, L = 64, R = 8, T = 12, B = 44, pw = W - L - R, ph = H - T - B, g = [];
  const tots = o.cats.map((c, i) => o.series.reduce((t, s, j) => t + (o.get(i, j) || 0), 0));
  const sc = scale(Math.max(0, ...tots));
  yAxis(g, { L, R, T, ph, W, top: sc.top, ticks: sc.ticks, f: o.fy || fmt, title: o.yTitle });
  const bw = pw / o.cats.length, gap = Math.max(1, Math.min(10, bw * 0.25)), every = Math.ceil(o.cats.length / Math.max(2, Math.floor(pw / 44)));
  o.cats.forEach((c, i) => {
    let y = T + ph; const x = L + i * bw + gap / 2;
    o.series.forEach((s, j) => {
      const v = o.get(i, j); if (!(v > 0)) return;
      const h = Math.max(1, ph * v / sc.top); y -= h;
      g.push(`<rect x="${r1(x)}" y="${r1(y)}" width="${r1(bw - gap)}" height="${r1(h)}" rx="2" ${fill(s.color)}${A({ tip: [c.long || c.label, s.name + ": " + o.fv(v), o.series.length > 1 ? "Tổng: " + o.fv(tots[i]) : null, s.f ? "Bấm để lọc " + s.name : null], f: s.f })}/>`);
    });
    if (i % every === 0) g.push(`<text x="${r1(x + (bw - gap) / 2)}" y="${T + ph + 18}" text-anchor="middle">${esc(c.label)}</text>`);
  });
  g.push(`<line class="ax" x1="${L}" x2="${W - R}" y1="${T + ph}" y2="${T + ph}"/>`);
  if (o.xTitle) g.push(`<text x="${L + pw / 2}" y="${H - 6}" text-anchor="middle">${esc(o.xTitle)}</text>`);
  return svg(W, H, o.aria, g.join(""));
}
/* Horizontal stacked bars. rows: { label, f, run, sid, dot, segs:[{v,color,name,f}], tip:[], right:[{t,color}] } */
export function hBars(o) {
  const W = o.W, rowH = o.rowH || 28, T = 8, B = 40;
  const LW = Math.min(o.LW || 220, Math.round(W * 0.36)), RW = Math.min(o.RW || 70, Math.round(W * 0.3)), pw = W - LW - RW - 12;
  const H = T + o.rows.length * rowH + B, g = [];
  const tots = o.rows.map(r => sum(r.segs, s => s.v));
  const sc = scale(Math.max(0, ...tots));
  sc.ticks.forEach(v => { const x = r1(LW + pw * v / sc.top); g.push(`<line class="gl" x1="${x}" x2="${x}" y1="${T}" y2="${T + o.rows.length * rowH}"/><text x="${x}" y="${T + o.rows.length * rowH + 16}" text-anchor="middle">${(o.fx || fmt)(v)}</text>`); });
  if (o.xTitle) g.push(`<text x="${LW + pw / 2}" y="${H - 4}" text-anchor="middle">${esc(o.xTitle)}</text>`);
  const chars = Math.floor((LW - 16) / 6.6);
  o.rows.forEach((r, i) => {
    const y = T + i * rowH, cy = y + rowH / 2;
    let lx = 0;
    if (r.dot) { g.push(`<rect x="0" y="${cy - 5}" width="10" height="10" rx="2" ${fill(r.dot)}/>`); lx = 16; }
    const act = r.f || r.run || r.sid || r.skill;
    g.push(`<text x="${lx}" y="${cy + 4}"${act ? ' class="v"' : ""}${A({ f: r.f, run: r.run, sid: r.sid, skill: r.skill, pressed: r.run ? r.run === o.selected : null, tip: [r.full || r.label, r.f ? "Bấm để lọc" : r.sid ? "Bấm để xem phiên" : r.run ? "Bấm để xem dòng thời gian" : r.skill ? "Bấm để đọc skill" : null] })}>${esc(cut(r.label, chars - (r.dot ? 2 : 0)))}</text>`);
    let x = LW;
    r.segs.forEach(s => {
      if (!(s.v > 0)) return;
      const w = Math.max(1, pw * s.v / sc.top);
      g.push(`<rect x="${r1(x)}" y="${r1(y + 4)}" width="${r1(w)}" height="${rowH - 8}" rx="2" ${fill(s.color)}${A({ tip: [r.full || r.label, s.name + ": " + (o.fv || fmt)(s.v) + (tots[i] ? " (" + pct(s.v, tots[i]) + ")" : ""), r.segs.length > 1 ? "Tổng: " + (o.fv || fmt)(tots[i]) : null].concat(r.tip || [], s.f ? ["Bấm để lọc " + s.name] : r.sid ? ["Bấm để xem phiên"] : []), f: s.f, sid: s.f ? null : r.sid })}/>`);
      x += w;
    });
    let rx = r1(x + 6);
    (r.right || [{ t: (o.fv || fmt)(tots[i]) }]).forEach(p => { g.push(`<text x="${rx}" y="${cy + 4}" ${p.color ? fill(p.color) : 'class="v"'}>${esc(p.t)}</text>`); rx += p.t.length * 7 + 8; });
  });
  g.push(`<line class="ax" x1="${LW}" x2="${LW}" y1="${T}" y2="${T + o.rows.length * rowH}"/>`);
  return svg(W, H, o.aria, g.join(""));
}
export function arcPath(cx, cy, r, ir, a0, a1) {
  const p = (rad, a) => [r1(cx + rad * Math.cos(a)), r1(cy + rad * Math.sin(a))];
  if (a1 - a0 >= Math.PI * 2 - 1e-6) a1 = a0 + Math.PI * 2 - 1e-4;
  const big = a1 - a0 > Math.PI ? 1 : 0, [x0, y0] = p(r, a0), [x1, y1] = p(r, a1), [x2, y2] = p(ir, a1), [x3, y3] = p(ir, a0);
  return `M${x0} ${y0}A${r} ${r} 0 ${big} 1 ${x1} ${y1}L${x2} ${y2}A${ir} ${ir} 0 ${big} 0 ${x3} ${y3}Z`;
}
/* Donut: parts [{name,v,color,f}] centred at cx, cy. */
export function donut(parts, cx, cy, r, title, sub) {
  const tot = sum(parts, p => p.v), g = [];
  let a = -Math.PI / 2;
  if (!tot) g.push(`<circle cx="${cx}" cy="${cy}" r="${r - r * 0.19}" style="fill:none;stroke:var(--surface0);stroke-width:${r * 0.38}"/>`);
  parts.forEach(p => {
    if (!(p.v > 0)) return;
    const a1 = a + Math.PI * 2 * p.v / tot;
    g.push(`<path d="${arcPath(cx, cy, r, r * 0.62, a, a1)}" style="fill:${p.color};stroke:var(--mantle);stroke-width:1"${A({ tip: [title, p.name + ": " + fmt(p.v) + " (" + pct(p.v, tot) + ")", p.f ? "Bấm để lọc" : null], f: p.f })}/>`);
    a = a1;
  });
  g.push(`<text x="${cx}" y="${cy - 2}" text-anchor="middle" class="v" style="font-weight:600;font-size:16px">${esc(fmt(tot))}</text><text x="${cx}" y="${cy + 16}" text-anchor="middle">${esc(sub || title)}</text>`);
  return g.join("");
}
export function squarify(items, x, y, w, h) {
  const out = [], total = sum(items, i => i.v);
  if (!total || w <= 0 || h <= 0) return out;
  const k = w * h / total;
  let rest = items.filter(i => i.v > 0).sort((a, b) => b.v - a.v).map(i => ({ i, a: i.v * k }));
  const worst = (row, side) => { const s = sum(row, r => r.a); return Math.max(...row.map(r => Math.max(side * side * r.a / (s * s), s * s / (side * side * r.a)))); };
  while (rest.length) {
    const side = Math.min(w, h);
    let row = [rest[0]], wv = worst(row, side), n = 1;
    while (n < rest.length) { const nr = row.concat(rest[n]), nw = worst(nr, side); if (nw > wv) break; row = nr; wv = nw; n++; }
    rest = rest.slice(n);
    const ra = sum(row, r => r.a);
    if (w >= h) { const cw = ra / h; let yy = y; row.forEach(r => { const rh = r.a / cw; out.push({ item: r.i, x, y: yy, w: cw, h: rh }); yy += rh; }); x += cw; w -= cw; }
    else { const rh = ra / w; let xx = x; row.forEach(r => { const rw = r.a / rh; out.push({ item: r.i, x: xx, y, w: rw, h: rh }); xx += rw; }); y += rh; h -= rh; }
  }
  return out;
}
export const spark = (vals, color) => {
  const n = vals.length, max = Math.max(1e-9, ...vals), W = 200, H = 40;
  if (n < 2) return svg(W, H, "Sparkline", "");
  const pts = vals.map((v, i) => r1(i * W / (n - 1)) + "," + r1(H - 3 - (H - 6) * v / max)).join(" ");
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><polyline points="0,${H} ${pts} ${W},${H}" style="fill:${mixc(color, 25)};stroke:none"/><polyline points="${pts}" style="fill:none;stroke:${color};stroke-width:2" vector-effect="non-scaling-stroke"/></svg>`;
};

export function gantt(i, ttok, role = state.role, id = "#g-" + i.r.id) {
  const d = state.data, now = d.generated_at;
  const tasks = i.r.tasks.filter(t => !role || t.role === role).map(t => {
    const s = t.started || t.created, done = t.status === "completed" || t.status === "failed";
    const e = t.ended || t.completed || (t.started && !done ? now : null);
    return { t, s, e, running: !!t.started && !done };
  }).sort((a, b) => (a.s || 0) - (b.s || 0));
  const fixN = new Map(i.fixes.map((t, n) => [t.id, n + 1]));
  const times = [i.r.created].concat(...tasks.map(x => [x.s, x.e]), i.r.gates.map(g => g.resolved)).filter(Boolean);
  const t0 = Math.min(...times), t1 = Math.max(t0 + 600, ...times);
  const W = widthOf(id), LW = Math.min(250, Math.round(W * 0.34)), Rm = 12, rowH = 24, T = 8, pw = W - LW - Rm, H = T + tasks.length * rowH + 40, g = [];
  const X = t => r1(LW + pw * (t - t0) / (t1 - t0));
  timeTicks(t0, t1, Math.max(3, Math.floor(pw / 64))).forEach(([t, lab]) => g.push(`<line class="gl" x1="${X(t)}" x2="${X(t)}" y1="${T}" y2="${T + tasks.length * rowH}"/><text x="${X(t)}" y="${T + tasks.length * rowH + 16}" text-anchor="middle">${lab}</text>`));
  const gatesBy = {};
  i.r.gates.forEach(gt => (gatesBy[gt.task] = gatesBy[gt.task] || []).push(gt));
  const chars = Math.floor((LW - 8) / 6.6);
  tasks.forEach((x, k) => {
    const t = x.t, y = T + k * rowH, cy = y + rowH / 2, col = roleCol(t.role), fx = fixN.get(t.id);
    g.push(`<text x="0" y="${cy + 4}"${t.role ? A({ f: "role:" + t.role, tip: [t.title, "Vai " + t.role + ", bấm để lọc"] }) : ""}${t.role ? ' class="v"' : ""}>${esc(cut((fx ? "Vòng sửa " + fx + ": " : "") + t.title, chars))}</text>`);
    const tip = [t.title, t.role ? "Vai: " + t.role + " (" + GROUPS[groupOf(t.role)][0] + ")" : null, "Trạng thái: " + t.status, t.agent ? AG[t.agent] || t.agent : "chưa có worker", x.s ? "Bắt đầu: " + dt(x.s) : null, x.e ? (x.running ? "Đang chạy, " + dur(x.e - x.s) : "Xong: " + dt(x.e) + ", " + dur(x.e - x.s)) : "Chưa chạy", "Token: " + fmt(ttok(t)), fx ? "Vòng sửa " + fx : null];
    if (x.s && x.e) {
      const w = Math.max(3, X(x.e) - X(x.s));
      g.push(`<rect x="${X(x.s)}" y="${y + 5}" width="${r1(w)}" height="${rowH - 10}" rx="3" style="fill:${x.running ? mixc(col, 35) : col};stroke:${x.running || t.status === "failed" ? (t.status === "failed" ? "var(--red)" : col) : "none"};stroke-width:2${x.running ? ";stroke-dasharray:4 3" : ""}"${A({ tip })}/>`);
      if (fx) g.push(`<text x="${r1(X(x.s) + w + 4)}" y="${cy + 4}" style="fill:var(--red);font-weight:600">sửa ${fx}</text>`);
    } else if (x.s) {
      g.push(`<circle cx="${X(x.s)}" cy="${cy}" r="5" style="fill:none;stroke:${col};stroke-width:2"${A({ tip })}/>`);
    }
    (gatesBy[t.id] || []).forEach(gt => {
      const gx = gt.resolved ? X(gt.resolved) : x.e ? X(x.e) : X(t1), c = GATE[gt.kind][1], gtip = ["Cổng: " + GATE[gt.kind][0], gt.question, gt.answer ? "Trả lời: " + gt.answer : "Chưa trả lời", gt.resolved ? dt(gt.resolved) : null];
      if (gt.kind === "approve") g.push(`<circle cx="${gx}" cy="${cy}" r="7" style="fill:${c};stroke:var(--mantle);stroke-width:2"${A({ tip: gtip })}/>`);
      else if (gt.kind === "changes") g.push(`<polygon points="${gx},${cy - 8} ${gx + 8},${cy} ${gx},${cy + 8} ${gx - 8},${cy}" style="fill:${c};stroke:var(--mantle);stroke-width:2"${A({ tip: gtip })}/>`);
      else g.push(`<rect x="${gx - 6}" y="${cy - 6}" width="12" height="12" rx="2" style="fill:${gt.kind === "pending" ? "var(--mantle)" : c};stroke:${c};stroke-width:2"${A({ tip: gtip })}/>`);
    });
  });
  if (i.st[1] === "đang chạy" && now <= t1) g.push(`<line x1="${X(now)}" x2="${X(now)}" y1="${T}" y2="${T + tasks.length * rowH}" style="stroke:var(--overlay2);stroke-dasharray:3 3"/>`);
  g.push(`<line class="ax" x1="${LW}" x2="${LW}" y1="${T}" y2="${T + tasks.length * rowH}"/>`);
  const groupsUsed = [...new Set(tasks.map(x => groupOf(x.t.role)))];
  const gkinds = [...new Set(i.r.gates.map(gt => gt.kind))];
  fig(id, { title: i.r.objective, body: tasks.length ? svg(W, H, "Dòng thời gian task của run " + i.r.objective, g.join("")) : "",
    legend: groupLegend(groupsUsed).concat(gkinds.map(k => ({ name: "Cổng " + GATE[k][0].toLowerCase() + (k === "approve" ? " (tròn)" : k === "changes" ? " (thoi)" : " (vuông)"), color: GATE[k][1] }))),
    caption: `<code>${esc(i.r.id)}</code>, repo ${esc(i.r.repo)}, <span class="chip ${i.st[0]}">${i.st[1]}</span> ${i.r.tokens.sessions} phiên nối được, Claude ${fmt(i.r.tokens.claude)}, Codex ${fmt(i.r.tokens.codex)}, Copilot ${fmt(i.r.tokens.copilot || 0)}. ${i.fix} vòng sửa, ${i.rer} re-review. Thanh viền đứt là task đang chạy.` });
}
/* Tooltip: one fixed box, text from data-tip, follows the pointer or the focused element. */
export const tipEl = $("#tip");
export function showTip(el, x, y) {
  tipEl.textContent = el.getAttribute("data-tip");
  tipEl.hidden = false;
  const w = tipEl.offsetWidth, h = tipEl.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
  let left = x + 14, top = y + 14;
  if (left + w > vw - 8) left = Math.max(8, x - w - 14);
  if (top + h > vh - 8) top = Math.max(8, y - h - 14);
  tipEl.style.left = left + "px"; tipEl.style.top = top + "px";
}
export function hideTip() { tipEl.hidden = true; }
document.addEventListener("pointerdown", e => { const el = e.target.closest && e.target.closest("[data-tip]"); if (el) showTip(el, e.clientX, e.clientY); });
document.addEventListener("pointermove", e => { const el = e.target.closest && e.target.closest("[data-tip]"); if (el) showTip(el, e.clientX, e.clientY); else hideTip(); });
document.addEventListener("pointerleave", hideTip);
document.addEventListener("focusin", e => { const el = e.target.closest && e.target.closest("[data-tip]"); if (el) { const b = el.getBoundingClientRect(); showTip(el, b.left + b.width / 2, b.bottom); } });
document.addEventListener("focusout", hideTip);
window.addEventListener("scroll", hideTip, { passive: true });
