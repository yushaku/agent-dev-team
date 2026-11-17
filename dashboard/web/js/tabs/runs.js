import * as C from "../lib/charts.js";
import { $, esc, agentsF, sum, runChart, EVENT_NAMES, dt } from "../lib/charts.js";

/* Run timeline helpers shared with the Theo repo / task view (overall.js). */
export function runDetail(r) {
  const fixes = r.tasks.filter(t => t.measurement?.kind === "fix").sort((a, b) => (a.started || a.created) - (b.started || b.created));
  const fix = fixes.length, rer = r.tasks.filter(t => t.measurement?.kind === "re-review").length;
  const rounds = new Set(r.tasks.filter(t => ["fix", "re-review"].includes(t.measurement?.kind) && t.measurement.round).map(t => t.measurement.round)).size;
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
