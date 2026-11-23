import * as C from "../lib/charts.js";
import { $, esc, agentsF, sum, runChart, EVENT_NAMES, dt } from "../lib/charts.js";

/* Run timeline helpers shared with the Theo repo / task view (overall.js). */
export function runDetail(r) {
  const fixes = r.tasks.filter(t => t.measurement?.kind === "fix").sort((a, b) => (a.started || a.created) - (b.started || b.created));
  const fix = fixes.length, rer = r.tasks.filter(t => t.measurement?.kind === "re-review").length;
  const rounds = r.fix_rounds?.count ?? new Set(r.tasks.filter(t => ["fix", "re-review"].includes(t.measurement?.kind) && t.measurement.round).map(t => t.measurement.round)).size;
  const unknownRounds = r.tasks.filter(t => ["fix", "re-review"].includes(t.measurement?.kind) && !t.measurement.round).length;
  const estimated = r.tasks.filter(t => t.measurement?.source !== "metadata").length;
  const cnt = k => r.gates.filter(g => g.kind === k).length;
  const st = { failed: ["risk", "có Task lỗi"], blocked: ["risk", "bị chặn"], in_progress: ["warn", "đang làm"],
    awaiting_approval: ["warn", "chờ PO duyệt"], awaiting_delivery: ["warn", "chờ duyệt delivery"],
    delivered: ["ok", "đã giao"], merged: ["ok", "đã merge"], cancelled: ["neutral", "đã hủy"] }[r.stage] || ["neutral", "chưa rõ delivery"];
  return { r, fixes, fix, rer, rounds, unknownRounds, estimated, ap: cnt("approve"), ch: cnt("changes"), ot: cnt("other"), pe: cnt("pending"), st };
}
export function communicationDiagram(run, id, availableWidth = 0) {
  const events = [...(run.events || [])].sort((a, b) => a.at - b.at);
  if (!events.length) return '<p class="muted">Chưa có sự kiện điều phối hoặc tin nhắn được ghi nhận.</p>';
  const participants = new Map(), tasks = new Map(run.tasks.map(t => [t.id, t]));
  const actor = (e, side) => e[side + "_actor"] || e[side];
  events.forEach(e => ["from", "to"].forEach(side => {
    const key = actor(e, side), task = tasks.get(e[side + "_task"]);
    if (!participants.has(key)) participants.set(key, { key, label: e[side], task });
    else if (task && !participants.get(key).task) participants.get(key).task = task;
  }));
  const lanes = [...participants.values()].sort((a, b) => {
    const rank = p => p.key === "po" || p.label === "PO" ? 0 : p.key === "coordinator" || p.label === "Orchestrator" ? 1 : 2;
    return rank(a) - rank(b);
  });
  const L = 104, laneW = Math.max(180, (availableWidth - L) / lanes.length), rowH = 64;
  const W = L + lanes.length * laneW, H = events.length * rowH + 16;
  const x = key => L + lanes.findIndex(p => p.key === key) * laneW + laneW / 2;
  const arrow = id + "-arrow";
  const lines = lanes.map(p => `<line x1="${x(p.key)}" x2="${x(p.key)}" y1="0" y2="${H}" class="lifeline"/>`).join("");
  const messages = events.map((e, index) => {
    const a = x(actor(e, "from")), b = x(actor(e, "to")), y = index * rowH + 40;
    const kind = EVENT_NAMES[e.kind] || "Inbox", label = e.text === kind ? kind : kind + ": " + e.text;
    const description = [dt(e.at), e.from + " → " + e.to, label];
    const path = a === b ? `M ${a} ${y - 16} h 42 v 20 h -42` : `M ${a} ${y} H ${b}`;
    const tx = a === b ? a + 42 : (a + b) / 2, ty = a === b ? y - 24 : y - 10;
    const chars = a === b ? 18 : Math.max(18, Math.floor(Math.abs(b - a) / 7));
    return `<g class="message-event" data-event="${index}" tabindex="0" role="button" aria-pressed="false" aria-label="${esc(description.join(" · "))}"${C.A({ tip: description })}>
      <rect class="event-hit" x="0" y="${index * rowH}" width="${W}" height="${rowH}"/>
      <text class="event-time" x="8" y="${y}">${esc(dt(e.at))}</text>
      <path d="${path}" style="stroke:${C.eventColour(e.kind)}" marker-end="url(#${esc(arrow)})"/>
      <text x="${tx}" y="${ty}" text-anchor="${a === b ? "end" : "middle"}">${esc(C.cut(label, chars))}</text>
    </g>`;
  }).join("");
  return `<div class="communication-scroll" tabindex="0" role="region" aria-label="Sơ đồ trao đổi, cuộn để xem các agent và sự kiện">
    <div class="communication-diagram" style="width:${W}px">
      <div class="participant-header" style="grid-template-columns:${L}px repeat(${lanes.length}, ${laneW}px)"><span>Thời điểm ↓</span>${lanes.map(p => {
        const label = p.task?.role || p.label, agent = p.task?.agent ? C.AG[p.task.agent] || p.task.agent : "";
        return `<div class="participant" title="${esc(p.label + " · " + p.key)}"><strong>${esc(C.cut(label, 22))}</strong><span>${esc([agent, p.task ? "#" + p.key.slice(-6) : ""].filter(Boolean).join(" · "))}</span></div>`;
      }).join("")}</div>
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="group" aria-label="Các mũi tên theo thứ tự thời gian">
        <defs><marker id="${esc(arrow)}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--subtext0)"/></marker></defs>
        ${lines}${messages}
      </svg>
    </div></div>`;
}

export function renderRunTimeline(info, selectedId, role = C.state.role, container, prefix) {
  const i = info.find(x => x.r.id === selectedId) || info.reduce((latest, x) => !latest || x.r.created > latest.r.created ? x : latest, null);
  if (!i) { $(container).innerHTML = '<p class="muted">Không có run nào trong khoảng này.</p>'; return; }
  const ags = agentsF(), ttok = t => sum(ags, a => t.tokens[a] || 0);
  const id = prefix + i.r.id;
  const events = [...(i.r.events || [])].sort((a, b) => a.at - b.at);
  const taskTypes = new Map();
  i.r.tasks.forEach(t => {
    const m = t.measurement, kind = !m?.kind || m.kind === "unknown" ? "chưa rõ" : m.kind;
    const label = kind + (m?.source === "title" ? " (ước tính)" : "");
    taskTypes.set(label, (taskTypes.get(label) || 0) + 1);
  });
  const types = [...taskTypes].map(([kind, count]) => kind + " × " + count).join(" · ") || "Chưa có task";
  const mailNote = i.r.messages_available === false ? "Không đọc được inbox; vẫn hiển thị các mốc giao việc và gate." :
    i.r.messages_limited ? "Inbox hiển thị tối đa 500 tin gần nhất." : "";
  $(container).innerHTML = `<figure class="chart" id="${esc(id)}"></figure>
    <section class="run-events" id="${esc(id)}-events" aria-labelledby="${esc(id)}-events-title"><figure class="chart"><h4 id="${esc(id)}-events-title">Điều phối &amp; trao đổi · ${events.length} sự kiện</h4>
    <div class="communication-context chart-subtitle"><p><strong>Run:</strong> ${esc(i.r.objective)}</p><p>${esc([i.r.repo, i.r.id, i.st[1]].filter(Boolean).join(" · "))}</p><p><strong>Loại task:</strong> ${esc(types)}</p></div>
    ${mailNote ? `<p class="muted">${mailNote}</p>` : ""}
    ${communicationDiagram(i.r, id + "-event", C.widthOf(container))}</figure></section>`;
  const selectEvent = e => {
    const target = e.target.closest("[data-event]");
    if (!target || (e.type === "keydown" && !["Enter", " "].includes(e.key))) return;
    if (e.type === "keydown") e.preventDefault();
    const index = Number(target.dataset.event), event = events[index];
    if (!event) return;
    document.querySelectorAll("#" + id + "-events [data-event]").forEach(el => el.setAttribute("aria-pressed", el === target));
    $("#detail-title").textContent = "Chi tiết trao đổi";
    $("#detail-body").innerHTML = `<div class="event-message"><p><strong>${esc(EVENT_NAMES[event.kind] || "Inbox")}</strong> · ${esc(dt(event.at))} · ${esc(event.from)} → ${esc(event.to)}</p><p>${esc(event.text)}</p>${event.body ? `<p>${esc(event.body)}</p>` : ""}</div>`;
    if (!$("#detail").open) $("#detail").showModal();
  };
  $("#" + id + "-events").addEventListener("click", selectEvent);
  $("#" + id + "-events").addEventListener("keydown", selectEvent);
  const draw = () => {
    runChart(i, ttok, role, "#" + id, C.state.runMetric || "time", true);
    $("#" + id + "-metric").addEventListener("click", () => {
      C.state.runMetric = C.state.runMetric === "tokens" ? "time" : "tokens";
      draw();
    });
  };
  draw();
}

const FEATURE_VARIANTS = [
  { id: "direct", name: "Trực tiếp", color: "var(--blue)" },
  { id: "orca", name: "Có Orca", color: "var(--green)" },
];
const FEATURE_SOURCES = { reports: "report Builder", "code-review": "lượt tải code-review", measurement: "Task Measurement" };

export function featureTimeline(rows, W) {
  const dated = rows.filter(f => f.last_activity != null);
  if (!dated.length) return "";
  const H = 260, L = 64, R = 12, T = 12, B = 44, ph = H - T - B;
  const first = Math.min(...dated.map(f => f.last_activity)), last = Math.max(...dated.map(f => f.last_activity));
  const t0 = first - 43200, t1 = last + 43200;
  const x = t => C.r1(L + (W - L - R) * (t - t0) / (t1 - t0));
  const sc = C.scale(Math.max(...dated.map(f => f.tokens))), g = [];
  C.yAxis(g, { L, R, T, ph, W, top: sc.top, ticks: sc.ticks, f: C.fmt, title: "Token" });
  const dates = new Set();
  C.timeTicks(t0, t1, Math.max(2, Math.floor((W - L - R) / 64))).forEach(([at]) => {
    if (dates.has(C.dm(at))) return;
    dates.add(C.dm(at));
    g.push(`<text x="${x(at)}" y="${T + ph + 20}" text-anchor="middle">${esc(C.dm(at))}</text>`);
  });
  g.push(`<line class="ax" x1="${L}" x2="${W - R}" y1="${T + ph}" y2="${T + ph}"/>`);
  dated.forEach(f => {
    const variant = FEATURE_VARIANTS.find(v => v.id === f.variant), source = FEATURE_SOURCES[f.fix_rounds.source];
    const status = f.delivered == null ? "Chưa rõ merge" : f.delivered ? "Đã merge" : "Chưa merge";
    const tip = [f.repo + " / " + f.branch, variant.name, "Hoạt động cuối: " + dt(f.last_activity),
      "Token: " + C.fmt(f.tokens), "Vòng sửa: " + f.fix_rounds.count + " · " + source,
      "Lỗi Gate 2: " + (f.gate2_findings == null ? "Chưa rõ" : f.gate2_findings), status];
    g.push(`<circle class="feature-point" cx="${x(f.last_activity)}" cy="${C.r1(T + ph - ph * f.tokens / sc.top)}" r="5" style="fill:${f.delivered ? variant.color : "var(--mantle)"};stroke:${variant.color};stroke-width:2${f.delivered == null ? ";stroke-dasharray:2 2" : ""}" tabindex="0" role="img" aria-label="${esc(tip.join(", "))}"${C.A({ tip })}/>`);
  });
  return C.svg(W, H, dated.length + " Run theo ngày hoạt động cuối và token", g.join(""));
}

export function renderFeatures(S) {
  const features = C.state.data.features?.runs || [];
  const keys = new Set(S.map(s => JSON.stringify([s.repo, s.branch])));
  const rows = features.filter(f => keys.has(JSON.stringify([f.repo, f.branch])));
  const value = v => v == null ? "Chưa rõ" : C.fmt(v);
  const median = values => {
    const sorted = [...values].sort((a, b) => a - b), n = sorted.length;
    return n ? (sorted[Math.floor(n / 2)] + sorted[Math.floor((n - 1) / 2)]) / 2 : null;
  };
  const variant = v => v === "orca" ? "Có Orca" : "Trực tiếp";
  const source = FEATURE_SOURCES;
  const groups = FEATURE_VARIANTS.map(v => ({ ...v, rows: rows.filter(f => f.variant === v.id) }));
  const counts = groups.map(v => v.name + ": " + v.rows.length + " Run").join(" · ");
  [
    ["#feature-tokens", "Token trung vị mỗi Run", group => median(group.map(f => f.tokens)), C.fmt, "Token"],
    ["#feature-fixes", "Vòng sửa trung vị", group => median(group.map(f => f.fix_rounds.count)), String, "Vòng sửa"],
    ["#feature-findings", "Tổng lỗi Gate 2 đã biết", group => {
      const known = group.filter(f => f.gate2_findings != null);
      return known.length ? sum(known, f => f.gate2_findings) : null;
    }, String, "Lỗi"],
  ].forEach(([id, title, metric, format, unit]) => {
    const values = groups.map(v => metric(v.rows));
    const top = C.scale(Math.max(0, ...values.map(v => v || 0))).top;
    C.fig(id, { title, subtitle: counts,
      body: rows.length ? C.hBars({ W: C.widthOf(id), LW: 100, RW: 78, rowH: 32, fv: format,
        fx: n => n === 0 || n === top ? (unit === "Token" ? C.fmt(n) : String(+n.toFixed(2))) : "", xTitle: unit, aria: title,
        rows: groups.map((v, i) => {
          const n = values[i];
          return { label: v.name, full: v.name + ": " + v.rows.length + " Run", dot: v.color,
            segs: [{ v: n || 0, color: v.color, name: title }], right: [{ t: n == null ? "Chưa rõ" : format(n) }] };
        }) }) : "",
      caption: id === "#feature-findings" ? groups.map(v => `${esc(v.name)}: ${v.rows.filter(f => f.gate2_findings != null).length}/${v.rows.length} Run có dữ liệu`).join(" · ") : "",
    });
  });
  C.fig("#feature-distribution", { title: "Phân bố vòng sửa", subtitle: counts,
    legend: FEATURE_VARIANTS, body: rows.length ? C.vBars({ W: C.widthOf("#feature-distribution"),
      cats: ["0", "1", "2", "3+"].map(label => ({ label, long: label + " vòng sửa" })), series: FEATURE_VARIANTS,
      get: (i, j) => groups[j].rows.filter(f => Math.min(3, f.fix_rounds.count) === i).length,
      fv: v => v + " Run", fy: v => Number.isInteger(v) ? String(v) : "", yTitle: "Số Run", xTitle: "Vòng sửa", aria: "Số Run theo nhóm vòng sửa và cách chạy",
    }) : "" });
  C.fig("#feature-time", { title: "Run theo thời gian", subtitle: rows.length + " Run · Mỗi chấm là một Run",
    body: featureTimeline(rows, C.widthOf("#feature-time")), legend: FEATURE_VARIANTS,
    caption: "Ngày hoạt động cuối · Chấm đặc: đã merge; rỗng: chưa merge; viền đứt: chưa rõ. Di chuột hoặc dùng Tab để xem chi tiết.",
  });
  const table = (headers, body) => `<div class="table-wrap" tabindex="0" role="region" aria-label="Bảng so sánh Run"><table><thead><tr>${headers.map(h => `<th scope="col">${h}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></div>`;
  $("#feature-runs").innerHTML = rows.length ? table(["Cách chạy", "Repo / nhánh", "Hoạt động", "Thời gian", "Token", "Vòng sửa / nguồn", "Lỗi Gate 2", "Đã giao"], rows.map(f => {
    const skills = Object.entries(f.loaded_skills).map(([name, count]) => name + " × " + count).join(", ");
    const split = f.variant === "orca" ? `<br><small>Điều phối: ${value(f.orchestrator_tokens)} · Worker: ${value(f.worker_tokens)}</small>` : "";
    return `<tr><td>${variant(f.variant)}</td><th scope="row">${esc(f.repo)}<br>${esc(f.branch)}<br><small>${f.session_count} phiên · ${esc(f.agents.join(", "))}</small><details><summary>Skill và Run liên kết</summary><p>${esc(skills || "Chưa ghi nhận skill")}</p><p>${esc(f.run_ids.join(", "))}</p></details></th><td>${esc(dt(f.first_activity))}<br>${esc(dt(f.last_activity))}</td><td>${f.lead_seconds == null ? "Chưa rõ" : C.dur(f.lead_seconds)}</td><td>${value(f.tokens)}${split}</td><td>${f.fix_rounds.count}<br><small>${esc(source[f.fix_rounds.source] || f.fix_rounds.source)}</small></td><td>${value(f.gate2_findings)}</td><td>${f.delivered == null ? "Chưa rõ" : f.delivered ? "Đã merge" : "Chưa merge"}</td></tr>`;
  }).join("")) : '<p class="muted">Không có Run trên nhánh tính năng trong khoảng và bộ lọc này.</p>';
}
