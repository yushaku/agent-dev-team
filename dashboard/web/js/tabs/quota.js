import { $, esc, COL, pad } from "../lib/charts.js";

const NAME = { claude: "Claude", codex: "Codex", copilot: "Copilot", cursor: "Cursor" };
const ORDER = ["claude", "codex", "copilot", "cursor"];
const Q = { data: null, busy: false, started: false };

const tone = r => (r < 15 ? "var(--red)" : r < 35 ? "var(--yellow)" : "var(--green)");
const fmtReset = s => {
  if (!s) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(s);
  if (!m) return s;
  return m[3] + "/" + m[2] + (m[4] ? " " + m[4] + ":" + m[5] : "");
};
const fmtWindow = w => {
  const m = /^(\d+) min$/.exec(w || "");
  const VI = { "week (all models)": "tuần, mọi model", "month (included)": "tháng, phần trong gói", "monthly (chat)": "tháng, chat" };
  if (!m) return VI[w] || w || "";
  const n = +m[1];
  return n % 10080 === 0 ? (n === 10080 ? "tuần" : n / 10080 + " tuần") : n % 1440 === 0 ? n / 1440 + " ngày" : n % 60 === 0 ? n / 60 + " giờ" : w;
};

function card(a, x) {
  const name = `<h4 style="color:${COL[a] || "var(--text)"}">${esc(NAME[a])}</h4>`;
  if (!x || !x.ok || typeof x.remaining_pct !== "number") {
    return `<article class="card quota-card">${name}<span class="muted small">${esc(String(x && x.error || "").slice(0, 120))}</span></article>`;
  }
  const rem = x.remaining_pct, used = Math.max(0, Math.min(100, x.used_pct));
  const meta = [x.plan, fmtWindow(x.window)].filter(Boolean).join(" · ");
  const best = Q.best === a ? `<span class="chip ok">nhiều hạn mức nhất</span>` : "";
  return `<article class="card quota-card">${name}<span class="big" style="color:${tone(rem)}">${+rem.toFixed(0)}% còn lại</span>` +
    `<span class="quota-bar" role="img" aria-label="Đã dùng ${used.toFixed(0)}%"><i style="width:${used}%;background:${tone(rem)}"></i></span>` +
    (meta ? `<span class="muted small">${esc(meta)}</span>` : "") +
    (x.resets_at ? `<span class="muted small">Reset ${esc(fmtReset(x.resets_at))}</span>` : "") + best + `</article>`;
}

function render() {
  const el = $("#quota");
  if (!el) return;
  const d = Q.data;
  if (!d) { el.innerHTML = Q.busy ? `<p class="muted small">Đang đo (~30 giây)</p>` : ""; return; }
  if (d.error && !ORDER.some(a => d[a])) { el.innerHTML = `<p class="muted small">${esc(d.error)} <button type="button" id="q-redo">Đo lại</button></p>`; wire(); return; }
  const ok = a => d[a] && d[a].ok && typeof d[a].remaining_pct === "number";
  const pick = ["claude", "codex"].filter(ok).sort((a, b) => d[b].remaining_pct - d[a].remaining_pct)[0];
  Q.best = pick;
  const t = d.checked_at ? new Date(d.checked_at * 1000) : null;
  el.innerHTML = `<div class="grid quota-grid">${ORDER.map(a => card(a, d[a])).join("")}</div>` +
    `<p class="muted small quota-foot">${t ? "Cập nhật lúc " + pad(t.getHours()) + ":" + pad(t.getMinutes()) + " " : ""}` +
    `<button type="button" class="linkbtn" id="q-redo"${Q.busy ? " disabled" : ""}>${Q.busy ? "Đang đo (~30 giây)" : "Đo lại"}</button></p>`;
  wire();
}

function wire() {
  const b = $("#q-redo");
  if (b) b.onclick = () => load(true);
}

async function load(fresh) {
  if (Q.busy) return;
  Q.busy = true; render();
  try {
    const r = await fetch("/api/quota" + (fresh ? "?fresh=1" : ""), { cache: "no-store" });
    Q.data = await r.json();
  } catch (e) {
    Q.data = Q.data || { error: "Không tải được hạn mức" };
  }
  Q.busy = false; render();
}

export function initQuota() {
  if (!Q.started) { Q.started = true; load(false); } else render();
}
