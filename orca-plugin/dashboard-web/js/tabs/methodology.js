import { $, AG, esc } from "../lib/charts.js";

/* "Cách tính": the data sources come from the snapshot's `sources` list (what the ledger actually reads), not from fixed prose. */
const AUXILIARY = { rtk: "RTK", orca: "Orca" };
export function renderMethodology(sources) {
  const box = $("#src-list");
  if (!box) return;
  if (!Array.isArray(sources) || !sources.length) {
    box.innerHTML = '<p class="muted">Chưa có danh sách nguồn dữ liệu.</p>';
    return;
  }
  box.innerHTML = `<dl class="kv">${sources
    .map((s) => {
      const label = AUXILIARY[s.kind] || AG[s.kind];
      const seen = s.files != null ? (s.files ? `${esc(s.files)} file đã đọc` : "chưa có dữ liệu") : s.present ? "" : "chưa có dữ liệu";
      const files = seen ? ` <span class="muted small">(${seen})</span>` : "";
      return `<dt>${esc(label)}</dt><dd><code>${esc(s.path)}</code>${files}<br>${esc(s.note)}</dd>`;
    })
    .join("")}</dl>`;
}
