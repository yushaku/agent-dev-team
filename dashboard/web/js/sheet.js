/* Skill side panel: a click on any [data-skill] opens #sheet with the SKILL.md body from /api/team/skill. */
import { esc, lex, shift, parse, decorate } from "/js/md.js";

const $ = s => document.querySelector(s);
const ORIGIN = {
  own: ["info", "Tự tạo"],
  dl: ["neutral", "Tải về"],
  orca: ["neutral", "Orca"],
  missing: ["risk", "Không có trong shared hub"],
};

async function getJSON(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(url + ": HTTP " + r.status);
  return r.json();
}

function mdBlock(tokens) {
  const div = document.createElement("div");
  div.className = "md";
  div.innerHTML = parse(tokens);
  decorate(div);
  return div;
}

function kv(pairs) {
  const dl = document.createElement("dl");
  dl.className = "kv";
  dl.innerHTML = pairs.filter(p => p[1]).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join("");
  return dl;
}

function openSheet(title, build) {
  const dlg = $("#sheet"), body = $("#sheet-body");
  $("#sheet-title").textContent = title;
  body.replaceChildren(Object.assign(document.createElement("p"), { className: "muted", textContent: "Đang tải" }));
  if (!dlg.open) dlg.showModal();
  dlg.scrollTop = 0;
  $("#sheet-close").focus();
  Promise.resolve().then(build).then(nodes => { if ($("#sheet-title").textContent === title) body.replaceChildren(...nodes); })
    .catch(e => body.replaceChildren(Object.assign(document.createElement("p"), { className: "muted", textContent: "Lỗi: " + e.message })));
}

function openSkill(name) {
  openSheet(name, async () => {
    const s = await getJSON("/api/team/skill?name=" + encodeURIComponent(name));
    const [cls, lab] = ORIGIN[s.origin] || ORIGIN.missing;
    const out = [kv([
      ["Nguồn gốc", `<span class="chip ${cls}">${esc(lab)}</span> <span class="muted">${esc(s.source)}</span>`],
      ["Mô tả", /^[>|][+-]?$/.test(s.description || "") ? "" : esc(s.description || "")],  // folded YAML scalar, no text on the line
      ["Đường dẫn", s.path ? `<code>${esc(s.path)}</code>` : ""],
      ["references/", s.refs.length ? s.refs.map(f => `<code>${esc(f)}</code>`).join(" ") : ""],
    ])];
    if (s.body) {
      out.push(mdBlock(shift(lex(s.body), d => d + 2)));  // # -> h3, ## -> h4, ### -> h5
    } else {
      out.push(Object.assign(document.createElement("div"), { className: "callout warn", innerHTML: `<p><span class="callout-label">Không có nội dung</span>Skill này không có trong shared hub${s.path ? `; bản gốc ở <code>${esc(s.path)}</code>` : ""}. Agent ngoài Hermes không đọc được nó theo tên.</p>` }));
    }
    return out;
  });
}

export function initSheet() {
  document.addEventListener("click", e => {
    const sk = e.target.closest("[data-skill]");
    if (sk) openSkill(sk.dataset.skill);
  });
  const dlg = $("#sheet");
  $("#sheet-close").addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", e => {
    if (e.target !== dlg) return;
    const r = dlg.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dlg.close();
  });
}
