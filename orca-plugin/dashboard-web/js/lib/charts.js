/* Token dashboard tab: Claude, Codex, GitHub Copilot CLI and Orca usage from GET /api/data (ported from the old dashboard page). */
export const $ = (s) => document.querySelector(s);
export const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const AG = { claude: "Claude", codex: "Codex", copilot: "Copilot", hermes: "Hermes" };
export const AGENTS = ["claude", "codex", "copilot", "hermes"];
export const zeroAg = () => ({ claude: 0, codex: 0, copilot: 0, hermes: 0 });
export const state = { days: 7, repo: "", agent: "", role: "", wt: "", runF: "", taskF: "", searchHidden: [], data: null, auto: true, timer: null };
try {
  const s = JSON.parse(localStorage.getItem("team-dashboard") || "{}");
  Object.assign(state, {
    days: s.days || 7,
    repo: s.repo || "",
    agent: s.agent || "",
    role: s.role || "",
    wt: s.wt || "",
    runF: s.runF || "",
    taskF: s.taskF || "",
    searchHidden: Array.isArray(s.searchHidden) ? s.searchHidden : [],
    auto: s.auto !== false,
  });
} catch {}
if (!AGENTS.includes(state.agent)) state.agent = "";
export const persist = () => {
  try {
    localStorage.setItem(
      "team-dashboard",
      JSON.stringify({
        days: state.days,
        repo: state.repo,
        agent: state.agent,
        role: state.role,
        wt: state.wt,
        runF: state.runF,
        taskF: state.taskF,
        searchHidden: state.searchHidden,
        auto: state.auto,
      }),
    );
  } catch {}
};

/* ---------- colours: one meaning each ---------- */
export const COL = {
  claude: "var(--claude)",
  codex: "var(--codex)",
  copilot: "var(--copilot)",
  hermes: "var(--hermes)",
  fin: "var(--p-fin)",
  cr: "var(--p-cr)",
  cw: "var(--p-cw)",
  out: "var(--p-out)",
};
export const PARTS = [
  ["fin", "Input mới"],
  ["cr", "Cache đọc"],
  ["cw", "Cache ghi"],
  ["out", "Output"],
];
export const GROUPS = {
  po: ["PO", "var(--sky)"],
  orch: ["Orchestrator", "var(--blue)"],
  plan: ["Plan", "var(--mauve)"],
  build: ["Build", "var(--green)"],
  verify: ["Verify", "var(--peach)"],
  delivery: ["Delivery", "var(--pink)"],
  direct: ["Chat trực tiếp", "var(--overlay0)"],
  other: ["Khác", "var(--overlay2)"],
};
export const ROLE_GROUP = {
  po: "po",
  orchestrator: "orch",
  designer: "plan",
  architect: "plan",
  "solution-architect": "plan",
  "tech-lead": "plan",
  researcher: "plan",
  support: "plan",
  "support-engineer": "plan",
  builder: "build",
  "anti-ai": "verify",
  reviewer: "verify",
  security: "verify",
  "perf-a11y": "verify",
  "doc-keeper": "delivery",
  "chat trực tiếp": "direct",
};
export const ROLE_SRC = { orca: "task Orca", "role-line": "dòng Role:", dispatch: "lệnh giao việc Orca", title: "title", skill: "skill" };
export const groupOf = (r) => ROLE_GROUP[r] || "other";
export const roleCol = (r) => GROUPS[groupOf(r)][1];
export const GATE = {
  approve: ["Duyệt", "var(--green)"],
  changes: ["Yêu cầu sửa", "var(--yellow)"],
  other: ["Khác", "var(--blue)"],
  pending: ["Đang chờ", "var(--overlay2)"],
};
export const mixc = (c, p) => (p >= 100 ? c : `color-mix(in srgb, ${c} ${p}%, var(--mantle))`);
export let MIXCOL = {};
export function buildMixColours() {
  // stable across filters: rank model+effort keys per agent on the full data
  const tot = {};
  state.data.sessions.forEach((s) =>
    Object.entries(s.mix).forEach(([k, v]) => {
      const key = s.agent + "|" + k;
      tot[key] = (tot[key] || 0) + v;
    }),
  );
  MIXCOL = {};
  AGENTS.forEach((a) =>
    Object.keys(tot)
      .filter((k) => k.startsWith(a + "|"))
      .sort((x, y) => tot[y] - tot[x])
      .forEach((k, i) => {
        MIXCOL[k] = mixc(COL[a], [100, 70, 48, 32][Math.min(i, 3)]);
      }),
  );
}
export const mixCol = (k) => MIXCOL[k] || "var(--overlay0)";
export const mixName = (k) => {
  const [a, m, e] = k.split("|");
  return `${AG[a] || a}: ${m} / ${e}`;
};

/* ---------- formatting ---------- */
export function fmt(n) {
  if (n == null || Number.isNaN(Number(n))) return "?";
  const a = Math.abs(n);
  if (a >= 1e9) return +(n / 1e9).toFixed(a >= 1e10 ? 0 : 1) + "B";
  if (a >= 1e6) return +(n / 1e6).toFixed(a >= 1e7 ? 0 : 1) + "M";
  if (a >= 1e3) return +(n / 1e3).toFixed(a >= 1e4 ? 0 : 1) + "K";
  return String(Math.round(n));
}
export const pct = (a, b) => (b ? ((100 * a) / b).toFixed(1) + "%" : "0%");
export const pad = (n) => String(n).padStart(2, "0");
export const dt = (ts) => {
  if (!ts) return "?";
  const d = new Date(ts * 1000);
  return pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
};
export const hm = (ts) => {
  const d = new Date(ts * 1000);
  return pad(d.getHours()) + ":" + pad(d.getMinutes());
};
export const dm = (ts) => {
  const d = new Date(ts * 1000);
  return pad(d.getDate()) + "/" + pad(d.getMonth() + 1);
};
export const dur = (s) => {
  if (!s || s < 0) return "0 ph";
  const m = Math.round(s / 60);
  return m < 60 ? m + " ph" : Math.floor(m / 60) + " g " + (m % 60) + " ph";
};
export const median = (a) => {
  if (!a.length) return 0;
  const b = [...a].sort((x, y) => x - y);
  const m = b.length >> 1;
  return b.length % 2 ? b[m] : Math.round((b[m - 1] + b[m]) / 2);
};
export const sum = (a, f) => a.reduce((t, x) => t + (f(x) || 0), 0);
export const sessionCount = (S) => new Set(S.map((s) => s.agent + ":" + (s.session_id || s.id))).size;
export const cut = (s, n) => {
  s = String(s || "");
  return s.length > n ? s.slice(0, Math.max(1, n - 1)) + "…" : s;
};
export const r1 = (n) => Math.round(n * 10) / 10;

/* ---------- data ---------- */
/* Split hint: a session should have been split when it burns many tokens or its context stays large. */
export const SPLIT_TOTAL = 20e6,
  SPLIT_CTX = 150e3;
export function splitWhy(s) {
  // Hermes stores one aggregate call, so ctx_* only counts when calls > 1
  const r = [];
  if (s.total >= SPLIT_TOTAL) r.push(`Tốn ${+(s.total / 1e6).toFixed(1)}M token`);
  if (s.calls > 1 && s.ctx_med >= SPLIT_CTX) r.push(`Context trung vị ${Math.round(s.ctx_med / 1e3)}k`);
  return r.join(", ");
}
export function sessionsF(featureBranches = false) {
  return state.data.sessions.filter(
    (s) =>
      (!state.repo || s.repo === state.repo || (featureBranches && (s.feature_segments || []).some((p) => p.repo === state.repo))) &&
      (!state.agent || s.agent === state.agent) &&
      (!state.role || s.role === state.role) &&
      (!state.wt || s.worktree === state.wt) &&
      (!state.runF || s.run_id === state.runF) &&
      (!state.taskF || s.task_id === state.taskF),
  );
}
export const agentsF = () => AGENTS.filter((a) => !state.agent || a === state.agent);
/* Buckets: hours for a 1 day range, days otherwise. Each value is [fin, cr, cw, out, premium requests]. */
export function buckets() {
  const d = state.data;
  if (d.days === 1)
    return Array.from({ length: 24 }, (_, h) => ({
      k: d.dates[0] + " " + pad(h),
      label: pad(h) + "h",
      long: d.dates[0].slice(8) + "/" + d.dates[0].slice(5, 7) + " " + pad(h) + ":00",
      src: "hours",
    }));
  return d.dates.map((k) => ({ k, label: k.slice(8) + "/" + k.slice(5, 7), long: k.slice(8) + "/" + k.slice(5, 7) + "/" + k.slice(0, 4), src: "days" }));
}
export const bval = (s, b) => (s[b.src] && s[b.src][b.k]) || null;

/* ---------- SVG kit ---------- */
/* Interactive attributes: tooltip lines, cross filter, session, skill. */
export function A(o) {
  let s = "";
  if (o.tip) s += ` data-tip="${esc(o.tip.filter((x) => x != null && x !== "").join("\n"))}"`;
  if (o.f) s += ` data-f="${esc(o.f)}"`;
  if (o.toggle) s += ` data-toggle="${esc(o.toggle)}"`;
  if (o.sid) s += ` data-sid="${esc(o.sid)}"`;
  if (o.skill) s += ` data-skill="${esc(o.skill)}"`;
  if (o.pressed != null) s += ` aria-pressed="${o.pressed}"`;
  if (o.f || o.toggle || o.sid || o.skill) s += ` tabindex="0" role="button" aria-label="${esc((o.tip || [o.f || o.toggle || o.sid || o.skill]).join(", "))}"`;
  return s;
}
let chartId = 0;
export const svg = (W, H, label, inner) => {
  const id = "token-" + ++chartId;
  const patterns = {
    cr: '<path d="M-2 2L2-2M0 6L6 0M4 8L8 4"/>',
    cw: '<path d="M2 0V6M5 0V6"/>',
    out: '<circle cx="3" cy="3" r="1" style="fill:var(--mantle);stroke:none"/>',
  };
  const used = Object.keys(patterns).filter((k) => inner.includes(`var(--p-${k})`));
  for (const k of used) inner = inner.replaceAll(`var(--p-${k})`, `url(#${id}-${k})`);
  const defs = used
    .map(
      (k) =>
        `<pattern id="${id}-${k}" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" style="fill:var(--p-${k})"/><g style="stroke:var(--mantle);stroke-width:1;opacity:.4">${patterns[k]}</g></pattern>`,
    )
    .join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(label)}">${defs ? `<defs>${defs}</defs>` : ""}${inner}</svg>`;
};
export const swatch = (color) =>
  `<span class="swatch" style="--c:${color}">${color.startsWith("var(--p-") ? svg(12, 12, "", `<rect width="12" height="12" style="fill:${color}"/>`).replace('role="img"', 'aria-hidden="true"') : ""}</span>`;
export const fill = (c) => `style="fill:${c}"`;
export function widthOf(id) {
  const el = $(id);
  let padX = 48;
  try {
    const cs = getComputedStyle(el);
    padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
  } catch {}
  const w = el?.clientWidth ? el.clientWidth - padX : 900;
  return Math.max(280, Math.round(w));
}
export function fig(id, o) {
  const el = $(id);
  if (!el) return;
  const legend = (o.legend || [])
    .map(
      (l) =>
        `<li${l.f || l.toggle ? A({ f: l.f, toggle: l.toggle, pressed: l.pressed ?? (l.f ? state[l.f.slice(0, l.f.indexOf(":"))] === l.f.slice(l.f.indexOf(":") + 1) : undefined), tip: [l.name, l.tip || (l.f ? "Bấm để lọc" : "Bấm để ẩn hoặc hiện")] }) : ""}>${swatch(l.color)}${esc(l.name)}</li>`,
    )
    .join("");
  const heading = `<h4>${esc(o.title)}</h4>`;
  const key = legend ? `<ul class="legend">${legend}</ul>` : "";
  const legendBlock = (o.legend || []).length > 6 ? `<details class="chart-key"><summary>Chú giải · ${o.legend.length} mục</summary>${key}</details>` : key;
  el.innerHTML = `${o.action ? `<div class="run-chart-toolbar">${heading}${o.action}</div>` : heading}${o.subtitle ? `<p class="chart-subtitle">${esc(o.subtitle)}</p>` : ""}${legendBlock}${o.body ? `<div class="chart-scroll">${o.body}</div>` : `<p class="empty">${esc(o.empty || "Không có dữ liệu trong khoảng này.")}</p>`}${o.caption ? `<figcaption>${o.caption}</figcaption>` : ""}`;
}
export const agentLegend = () => agentsF().map((a) => ({ name: AG[a], color: COL[a], f: "agent:" + a }));
export const partLegend = () => PARTS.map(([k, n]) => ({ name: n, color: COL[k] }));
export const groupLegend = (gs) => gs.map((g) => ({ name: GROUPS[g][0], color: GROUPS[g][1] }));
export function scale(max, n = 4) {
  if (!(max > 0)) max = 1;
  const raw = max / n,
    p = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((v) => v >= raw);
  const top = Math.ceil(max / step - 1e-9) * step,
    ticks = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(v);
  return { top, ticks };
}
/* Local time ticks aligned to round hours or midnight. */
export function timeTicks(t0, t1, maxN) {
  const steps = [60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400, 172800, 604800];
  const step = steps.find((s) => (t1 - t0) / s <= maxN) || 604800;
  const L = -new Date(t0 * 1000).getTimezoneOffset() * 60;
  const out = [];
  for (let t = Math.ceil((t0 + L) / step) * step - L; t <= t1; t += step) {
    const mid = new Date(t * 1000).getHours() === 0;
    out.push([t, step >= 86400 || (mid && step < 86400) ? dm(t) : hm(t)]);
  }
  return out;
}
export function yAxis(g, { L, R, T, ph, W, top, ticks, f, title }) {
  ticks.forEach((v) => {
    const y = r1(T + ph - (ph * v) / top);
    g.push(`<line class="gl" x1="${L}" x2="${W - R}" y1="${y}" y2="${y}"/><text x="${L - 8}" y="${y + 4}" text-anchor="end">${f(v)}</text>`);
  });
  if (title) g.push(`<text x="12" y="${T + ph / 2}" text-anchor="middle" transform="rotate(-90 12 ${T + ph / 2})">${esc(title)}</text>`);
}
/* Stacked vertical bars. o: { W, H, cats:[{label,long,run}], series:[{name,color,f}], get(ci,si), fv, yTitle, xTitle, aria } */
export function vBars(o) {
  const W = o.W,
    H = o.H || 260,
    L = 64,
    R = 8,
    T = 12,
    B = 44,
    pw = W - L - R,
    ph = H - T - B,
    g = [];
  const tots = o.cats.map((_c, i) => o.series.reduce((t, _s, j) => t + (o.get(i, j) || 0), 0));
  const sc = scale(Math.max(0, ...tots));
  yAxis(g, { L, R, T, ph, W, top: sc.top, ticks: sc.ticks, f: o.fy || fmt, title: o.yTitle });
  const bw = pw / o.cats.length,
    gap = Math.max(1, Math.min(10, bw * 0.25)),
    every = Math.ceil(o.cats.length / Math.max(2, Math.floor(pw / 44)));
  o.cats.forEach((c, i) => {
    let y = T + ph;
    const x = L + i * bw + gap / 2;
    o.series.forEach((s, j) => {
      const v = o.get(i, j);
      if (!(v > 0)) return;
      const h = Math.max(1, (ph * v) / sc.top);
      y -= h;
      g.push(
        `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(bw - gap)}" height="${r1(h)}" rx="2" ${fill(s.color)}${A({ tip: [c.long || c.label, s.name + ": " + o.fv(v), o.series.length > 1 ? "Tổng: " + o.fv(tots[i]) : null, s.f ? "Bấm để lọc " + s.name : null], f: s.f })}/>`,
      );
    });
    if (i % every === 0) g.push(`<text x="${r1(x + (bw - gap) / 2)}" y="${T + ph + 18}" text-anchor="middle">${esc(c.label)}</text>`);
  });
  g.push(`<line class="ax" x1="${L}" x2="${W - R}" y1="${T + ph}" y2="${T + ph}"/>`);
  if (o.xTitle) g.push(`<text x="${L + pw / 2}" y="${H - 6}" text-anchor="middle">${esc(o.xTitle)}</text>`);
  return svg(W, H, o.aria, g.join(""));
}
/* Horizontal stacked bars. rows: { label, f, sid, dot, segs:[{v,color,name,f}], tip:[], right:[{t,color}] } */
export function hBars(o) {
  const W = o.W,
    compact = W < 560,
    rowH = compact ? 52 : Math.max(32, o.rowH || 32),
    T = 8,
    B = 40;
  const right = (r) => r.right || [{ t: (o.fv || fmt)(sum(r.segs, (s) => s.v)) }];
  const valueWidth = Math.max(40, ...o.rows.map((r) => right(r).reduce((n, p) => n + String(p.t).length * 7 + 8, 0)));
  const LW = compact ? 0 : Math.min(o.LW || 220, Math.round(W * 0.36)),
    RW = Math.max(o.RW || 70, valueWidth),
    pw = Math.max(24, W - LW - RW - 12);
  const H = T + o.rows.length * rowH + B,
    g = [];
  const tots = o.rows.map((r) => sum(r.segs, (s) => s.v));
  const sc = scale(Math.max(0, ...tots));
  sc.ticks
    .filter((_v, i) => pw >= 200 || i % 2 === 0)
    .forEach((v) => {
      const x = r1(LW + (pw * v) / sc.top);
      g.push(
        `<line class="gl" x1="${x}" x2="${x}" y1="${T}" y2="${T + o.rows.length * rowH}"/><text x="${x}" y="${T + o.rows.length * rowH + 16}" text-anchor="${v === 0 ? "start" : "middle"}">${(o.fx || fmt)(v)}</text>`,
      );
    });
  if (o.xTitle) g.push(`<text x="${LW + pw / 2}" y="${H - 4}" text-anchor="middle">${esc(o.xTitle)}</text>`);
  const chars = Math.floor(((compact ? W : LW) - 16) / 6.6);
  o.rows.forEach((r, i) => {
    const y = T + i * rowH,
      cy = compact ? y + 10 : y + rowH / 2;
    let lx = 0;
    if (r.dot) {
      g.push(`<rect x="0" y="${cy - 5}" width="10" height="10" rx="2" ${fill(r.dot)}/>`);
      lx = 16;
    }
    const act = r.f || r.sid || r.skill;
    g.push(
      `<text x="${lx}" y="${cy + 4}"${act ? ' class="v"' : ""}${A({ f: r.f, sid: r.sid, skill: r.skill, tip: [r.full || r.label, r.f ? "Bấm để lọc" : r.sid ? "Bấm để xem phiên" : r.skill ? "Bấm để đọc skill" : null] })}>${esc(cut(r.label, chars - (r.dot ? 2 : 0)))}</text>`,
    );
    let x = LW;
    r.segs.forEach((s) => {
      if (!(s.v > 0)) return;
      const w = Math.max(1, (pw * s.v) / sc.top);
      g.push(
        `<rect x="${r1(x)}" y="${r1(compact ? y + 24 : y + 8)}" width="${r1(w)}" height="${compact ? 16 : rowH - 16}" rx="2" ${fill(s.color)}${A({ tip: [r.full || r.label, s.name + ": " + (o.fv || fmt)(s.v) + (tots[i] ? " (" + pct(s.v, tots[i]) + ")" : ""), r.segs.length > 1 ? "Tổng: " + (o.fv || fmt)(tots[i]) : null].concat(r.tip || [], s.f ? ["Bấm để lọc " + s.name] : r.sid ? ["Bấm để xem phiên"] : []), f: s.f, sid: s.f ? null : r.sid })}/>`,
      );
      x += w;
    });
    let rx = W;
    [...right(r)].reverse().forEach((p) => {
      g.push(`<text x="${rx}" y="${compact ? y + 36 : cy + 4}" text-anchor="end" ${p.color ? fill(p.color) : 'class="v"'}>${esc(p.t)}</text>`);
      rx -= String(p.t).length * 7 + 8;
    });
  });
  return svg(W, H, o.aria, g.join(""));
}
export function arcPath(cx, cy, r, ir, a0, a1) {
  const p = (rad, a) => [r1(cx + rad * Math.cos(a)), r1(cy + rad * Math.sin(a))];
  if (a1 - a0 >= Math.PI * 2 - 1e-6) a1 = a0 + Math.PI * 2 - 1e-4;
  const big = a1 - a0 > Math.PI ? 1 : 0,
    [x0, y0] = p(r, a0),
    [x1, y1] = p(r, a1),
    [x2, y2] = p(ir, a1),
    [x3, y3] = p(ir, a0);
  return `M${x0} ${y0}A${r} ${r} 0 ${big} 1 ${x1} ${y1}L${x2} ${y2}A${ir} ${ir} 0 ${big} 0 ${x3} ${y3}Z`;
}
/* Donut: parts [{name,v,color,f}] centred at cx, cy. */
export function donut(parts, cx, cy, r, title, sub) {
  const tot = sum(parts, (p) => p.v),
    g = [];
  let a = -Math.PI / 2;
  if (!tot) g.push(`<circle cx="${cx}" cy="${cy}" r="${r - r * 0.19}" style="fill:none;stroke:var(--surface0);stroke-width:${r * 0.38}"/>`);
  parts.forEach((p) => {
    if (!(p.v > 0)) return;
    const a1 = a + (Math.PI * 2 * p.v) / tot;
    g.push(
      `<path d="${arcPath(cx, cy, r, r * 0.62, a, a1)}" style="fill:${p.color};stroke:var(--mantle);stroke-width:1"${A({ tip: [title, p.name + ": " + fmt(p.v) + " (" + pct(p.v, tot) + ")", p.f ? "Bấm để lọc" : null], f: p.f })}/>`,
    );
    a = a1;
  });
  g.push(
    `<text x="${cx}" y="${cy - 2}" text-anchor="middle" class="v" style="font-weight:600;font-size:16px">${esc(fmt(tot))}</text><text x="${cx}" y="${cy + 16}" text-anchor="middle">${esc(sub || title)}</text>`,
  );
  return g.join("");
}
export function squarify(items, x, y, w, h) {
  const out = [],
    total = sum(items, (i) => i.v);
  if (!total || w <= 0 || h <= 0) return out;
  const k = (w * h) / total;
  let rest = items
    .filter((i) => i.v > 0)
    .sort((a, b) => b.v - a.v)
    .map((i) => ({ i, a: i.v * k }));
  const worst = (row, side) => {
    const s = sum(row, (r) => r.a);
    return Math.max(...row.map((r) => Math.max((side * side * r.a) / (s * s), (s * s) / (side * side * r.a))));
  };
  while (rest.length) {
    const side = Math.min(w, h);
    let row = [rest[0]],
      wv = worst(row, side),
      n = 1;
    while (n < rest.length) {
      const nr = row.concat(rest[n]),
        nw = worst(nr, side);
      if (nw > wv) break;
      row = nr;
      wv = nw;
      n++;
    }
    rest = rest.slice(n);
    const ra = sum(row, (r) => r.a);
    if (w >= h) {
      const cw = ra / h;
      let yy = y;
      row.forEach((r) => {
        const rh = r.a / cw;
        out.push({ item: r.i, x, y: yy, w: cw, h: rh });
        yy += rh;
      });
      x += cw;
      w -= cw;
    } else {
      const rh = ra / w;
      let xx = x;
      row.forEach((r) => {
        const rw = r.a / rh;
        out.push({ item: r.i, x: xx, y, w: rw, h: rh });
        xx += rw;
      });
      y += rh;
      h -= rh;
    }
  }
  return out;
}
export const spark = (vals, color) => {
  const n = vals.length,
    max = Math.max(1e-9, ...vals),
    W = 200,
    H = 40;
  if (n < 2) return svg(W, H, "Sparkline", "");
  const pts = vals.map((v, i) => r1((i * W) / (n - 1)) + "," + r1(H - 3 - ((H - 6) * v) / max)).join(" ");
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><polyline points="0,${H} ${pts} ${W},${H}" style="fill:${mixc(color, 25)};stroke:none"/><polyline points="${pts}" style="fill:none;stroke:${color};stroke-width:2" vector-effect="non-scaling-stroke"/></svg>`;
};

export const EVENT_NAMES = { dispatch: "Giao việc", gate_question: "Hỏi PO", gate_answer: "PO trả lời", peer: "Worker ↔ worker", message: "Inbox" };
export const eventColour = (kind) => (kind.startsWith("gate_") ? GROUPS.po[1] : kind === "peer" ? GROUPS.verify[1] : GROUPS.orch[1]);

export function runChart(i, ttok, role = state.role, id = "#g-" + i.r.id, metric = "time", withToggle = false) {
  const r = i.r,
    token = metric === "tokens",
    now = state.data.generated_at;
  const ags = agentsF(),
    activity = (r.orchestrator_activity || []).filter((a) => ags.includes(a.agent));
  const events = r.events || [],
    showOrch = !role || role === "orchestrator";
  const orchTokens = sum(ags, (a) => r.orchestrator_by_agent?.[a] || 0);
  const rows = r.tasks
    .filter((t) => !role || t.role === role)
    .map((t) => {
      const s = t.started || t.created,
        done = ["completed", "failed", "cancelled", "canceled"].includes(t.status);
      const e = t.ended || t.completed || (t.started && !done ? now : null);
      return { t, s, e, v: ttok(t), running: !!t.started && !done && !["blocked", "pending", "queued"].includes(t.status) };
    })
    .sort((a, b) => (a.s || Infinity) - (b.s || Infinity));
  if (showOrch && (activity.length || orchTokens || events.length))
    rows.unshift({
      orch: true,
      t: { title: "Orchestrator", role: "orchestrator", status: "observed" },
      v: orchTokens,
      s: Math.min(...activity.map((a) => a.start).filter(Boolean), ...events.map((e) => e.at)),
      e: Math.max(...activity.map((a) => a.end).filter(Boolean), ...events.map((e) => e.at)),
    });
  const times = [r.created, ...rows.flatMap((x) => [x.s, x.e]), ...events.map((e) => e.at), ...r.gates.flatMap((g) => [g.created, g.resolved || now])].filter(
    (t) => Number.isFinite(t) && t > 0,
  );
  const t0 = Math.min(now, ...times),
    t1 = Math.max(t0 + 60, ...times);
  let total = 0;
  rows.forEach((x) => {
    x.tokenStart = total;
    total += x.v;
  });
  const sc = scale(total);
  const W = Math.max(760, widthOf(id)),
    LW = 310,
    pw = W - LW - 64,
    T = 56,
    rowH = 56,
    H = T + rows.length * rowH + 32;
  const X = (v) => r1(LW + pw * (token ? v / sc.top : (v - t0) / (t1 - t0)));
  const ticks = token ? sc.ticks.map((v) => [v, fmt(v)]) : timeTicks(t0, t1, Math.max(3, Math.floor(pw / 80)));
  const statuses = {
    observed: "Điều phối · inbox · PO",
    completed: "Đã xong",
    in_progress: "Đang chạy",
    dispatched: "Đang chạy",
    running: "Đang chạy",
    blocked: "Bị chặn",
    failed: "Lỗi",
    pending: "Chưa chạy",
    ready: "Chưa chạy",
    queued: "Chưa chạy",
    cancelled: "Đã hủy",
    canceled: "Đã hủy",
  };
  const g = [
    `<text x="0" y="14">Task / trạng thái</text><text x="${LW}" y="14">${token ? "Token cộng dồn → · Tổng: " + fmt(total) + " token" : "Thời gian →"}</text>`,
  ];
  ticks.forEach(([v, label]) =>
    g.push(`<line class="gl" x1="${X(v)}" x2="${X(v)}" y1="${T}" y2="${H - 32}"/><text x="${X(v)}" y="${T - 10}" text-anchor="middle">${esc(label)}</text>`),
  );
  rows.forEach((x, k) => {
    const { t } = x,
      y = T + k * rowH,
      cy = y + rowH / 2,
      status = statuses[t.status] || t.status || "Chưa rõ";
    const col = ["failed", "blocked"].includes(t.status) ? "var(--red)" : roleCol(t.role);
    const span = x.s && x.e && Number.isFinite(x.s) && Number.isFinite(x.e) ? dur(x.e - x.s) : "Chưa chạy";
    const tip = [
      t.title,
      status,
      t.agent ? AG[t.agent] || t.agent : null,
      x.orch ? activity.map((a) => AG[a.agent] || a.agent).join(", ") : null,
      Number.isFinite(x.s) ? "Bắt đầu: " + dt(x.s) : null,
      Number.isFinite(x.e) ? "Kết thúc: " + dt(x.e) : null,
      "Token: " + fmt(x.v),
      x.orch ? "Khoảng quan sát gồm cả thời gian chờ; các mốc bên dưới là sự kiện được ghi nhận." : "Thời lượng: " + span,
      t.measurement?.round ? "Sửa vòng " + t.measurement.round : null,
    ];
    g.push(
      `<text class="task-name" x="0" y="${cy - 7}" tabindex="0"${A({ tip })}>${esc(cut(t.title, 42))}</text><text x="0" y="${cy + 13}">${esc(status)} · ${fmt(x.v)} token${!x.orch ? " · " + span : ""}</text>`,
    );
    const start = token ? x.tokenStart : x.s,
      end = token ? x.tokenStart + x.v : x.e;
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      if (x.orch && !token) {
        g.push(`<line x1="${X(start)}" x2="${X(end)}" y1="${cy}" y2="${cy}" style="stroke:${col};stroke-width:2;stroke-dasharray:3 4"${A({ tip })}/>`);
        r.gates.forEach((gt) => {
          if (!gt.created) return;
          const end = gt.resolved || now;
          g.push(
            `<line x1="${X(gt.created)}" x2="${X(Math.max(gt.created, end))}" y1="${cy + 8}" y2="${cy + 8}" style="stroke:${GROUPS.po[1]};stroke-width:4"${A({ tip: ["Chờ PO", gt.question, dur(end - gt.created)] })}/>`,
          );
        });
      } else
        g.push(
          `<rect x="${X(start)}" y="${cy - 9}" width="${r1(X(end) - X(start))}" height="18" rx="3" style="fill:${col}${x.running ? ";fill-opacity:.35;stroke:" + col + ";stroke-dasharray:4 3" : ""}"${A({ tip })}/>`,
        );
    } else if (!token && Number.isFinite(start))
      g.push(`<circle cx="${X(start)}" cy="${cy}" r="4" style="fill:none;stroke:${col};stroke-width:2"${A({ tip })}/>`);
    if (!token)
      events
        .filter((ev) => (x.orch ? ev.kind !== "peer" : ev.kind === "peer" && [ev.from_task, ev.to_task].includes(t.id)))
        .forEach((ev) => {
          const ex = X(ev.at),
            c = eventColour(ev.kind),
            tip = [EVENT_NAMES[ev.kind], dt(ev.at), ev.from + " → " + ev.to, ev.text, ev.body];
          const attrs = `style="fill:${c};stroke:var(--mantle);stroke-width:2" tabindex="0" aria-label="${esc(tip.filter(Boolean).join(" · "))}"${A({ tip })}`;
          if (ev.kind === "dispatch") g.push(`<polygon points="${ex},${cy - 6} ${ex + 6},${cy} ${ex},${cy + 6} ${ex - 6},${cy}" ${attrs}/>`);
          else if (ev.kind.startsWith("gate_")) g.push(`<rect x="${ex - 5}" y="${cy - 5}" width="10" height="10" ${attrs}/>`);
          else g.push(`<circle cx="${ex}" cy="${cy}" r="5" ${attrs}/>`);
        });
  });
  const legend = token
    ? groupLegend([...new Set(rows.map((x) => groupOf(x.t.role)))])
    : [...new Set(events.map((e) => e.kind))].map((kind) => ({
        name: EVENT_NAMES[kind] + (kind === "dispatch" ? " (thoi)" : kind.startsWith("gate_") ? " (vuông)" : " (tròn)"),
        color: eventColour(kind),
      }));
  const action = withToggle
    ? `<button type="button" id="${esc(id.slice(1))}-metric" aria-pressed="${token}">${token ? "Xem thời gian" : "Xem token"}</button>`
    : "";
  fig(id, {
    title: r.objective,
    action,
    body: rows.length
      ? svg(W, H, (token ? "Token theo thứ tự task" : "Dòng thời gian run") + " · " + r.objective, g.join("")).replace("<svg ", '<svg style="min-width:760px" ')
      : "",
    legend,
  });
}
export const gantt = (i, ttok, role = state.role, id = "#g-" + i.r.id) => runChart(i, ttok, role, id, "time");
export const tokenTimeline = (i, ttok, role = state.role, id = "#gt-" + i.r.id) => runChart(i, ttok, role, id, "tokens");
/* Tooltip: one fixed box, text from data-tip, follows the pointer or the focused element. */
export const tipEl = $("#tip");
export function showTip(el, x, y) {
  tipEl.textContent = el.getAttribute("data-tip");
  tipEl.hidden = false;
  const w = tipEl.offsetWidth,
    h = tipEl.offsetHeight,
    vw = window.innerWidth,
    vh = window.innerHeight;
  let left = x + 14,
    top = y + 14;
  if (left + w > vw - 8) left = Math.max(8, x - w - 14);
  if (top + h > vh - 8) top = Math.max(8, y - h - 14);
  tipEl.style.left = left + "px";
  tipEl.style.top = top + "px";
}
export function hideTip() {
  tipEl.hidden = true;
}
document.addEventListener("pointerdown", (e) => {
  const el = e.target.closest?.("[data-tip]");
  if (el) showTip(el, e.clientX, e.clientY);
});
document.addEventListener("pointermove", (e) => {
  const el = e.target.closest?.("[data-tip]");
  if (el) showTip(el, e.clientX, e.clientY);
  else hideTip();
});
document.addEventListener("pointerleave", hideTip);
document.addEventListener("focusin", (e) => {
  const el = e.target.closest?.("[data-tip]");
  if (el) {
    const b = el.getBoundingClientRect();
    showTip(el, b.left + b.width / 2, b.bottom);
  }
});
document.addEventListener("focusout", hideTip);
window.addEventListener("scroll", hideTip, { passive: true });
