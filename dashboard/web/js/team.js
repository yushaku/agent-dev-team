/* Team tabs: every text read live from the team root and the skills dir through /api/team/*. */
import { esc, lex, shift, parse, inline, sectionByPrefix, slug, decorate } from "/js/md.js";
import { tr } from "/js/vi.js";

const $ = s => document.querySelector(s);
let IDX = null;
const FILES = new Set();
const textCache = new Map();

/* Role groups: same colour key as the archify diagrams. */
export const GROUPS = [
  ["orch", "Orchestrator", ["orchestrator"]],
  ["plan", "Lên kế hoạch: spec, thiết kế, tra cứu, kiến trúc", ["pm", "designer", "tech-lead", "researcher", "solution-architect"]],
  ["build", "Xây dựng", ["builder"]],
  ["verify", "Kiểm tra", ["anti-ai", "qa", "reviewer", "security", "perf-a11y"]],
  ["delivery", "Bàn giao", ["delivery"]],
  ["maint", "Bảo trì", ["investigator"]],
];
const ORIGIN = {
  own: ["info", "Tự tạo"],
  dl: ["neutral", "Tải về"],
  orca: ["neutral", "Orca"],
  missing: ["risk", "Không có trong shared hub"],
};
const TIER_LABEL = { top: "top", work: "work", fast: "fast" };

/* Which source file feeds each tab, and which archify diagram stands for which section.
   A diagram anchored to a heading that no longer exists is shown at the end with a warning. */
const TABS = {
  "tong-quan": [
    { md: "README.md", diagrams: { "Roster": ["team-overview"] } },
    { diagram: "sessions", title: "Phiên làm việc", detail: [["roles/researcher.md", "Discussion"], ["docs-policy.md", "Scratch"]] },
    { diagram: "docs-layout", title: "Tài liệu: ai viết, ai đọc", detail: [["docs-policy.md", "Two audiences"]] },
    { diagram: "model-tiers", title: "Chọn model", detail: [["config.md", "Model tiers"]] },
  ],
  "flow": [
    { md: "workflow.md", diagrams: { "": ["dev-flow"] } },
    { diagram: "orch-wait", title: "Orchestrator chờ worker", detail: [["roles/orchestrator.md", "Every turn"], ["orchestrator/supervise.md", "Execute and supervise"], ["orchestrator/pitfalls.md", "Supervising workers"]] },
    { md: "orca.md" },
  ],
  "co-viec": [{ md: "sizing.md", diagrams: { "Sizes": ["sizes"] } }],
  "bao-tri": [{ md: "maintenance.md", diagrams: { "3. Ticket types and flows": ["ticket-types", "bug-ticket"] } }],
  "docs": [{ md: "docs-policy.md" }, { scenarios: true }],
  "config": [{ md: "config.md", configTable: true }, { md: "skills/init-team/SKILL.md" }],
};
const TAB_TITLE = { "tong-quan": "Đội agent phát triển phần mềm", flow: "Quy trình", "co-viec": "Quy mô việc", "bao-tri": "Bảo trì", docs: "Tài liệu và sơ đồ archify", config: "Cấu hình dự án" };

/* ---------------------------------------------------------------- data */
async function getJSON(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(url + ": HTTP " + r.status);
  return r.json();
}
async function getText(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(url + ": HTTP " + r.status);
  return r.text();
}
export const fileText = path => {
  if (!textCache.has(path)) textCache.set(path, getText("/api/team/file?path=" + encodeURIComponent(path)).catch(e => { textCache.delete(path); throw e; }));
  return textCache.get(path);
};
async function index() {
  if (!IDX) {
    IDX = await getJSON("/api/team/index");
    IDX.files.forEach(f => FILES.add(f));
    IDX.roleById = Object.fromEntries(IDX.roles.map(r => [r.id, r]));
    IDX.skillByName = Object.fromEntries(IDX.skills.map(s => [s.name, s]));
  }
  return IDX;
}
const groupOf = id => (GROUPS.find(g => g[2].includes(id)) || ["other"])[0];
const roleTitle = id => (IDX.roleById[id] || {}).title || id;

/* ---------------------------------------------------------------- building blocks */
function mdBlock(tokens, base) {
  const div = document.createElement("div");
  div.className = "md";
  div.innerHTML = parse(tokens);
  translateChrome(div, tokens);
  decorate(div, { files: FILES, base });
  return div;
}
/* Headings and table header cells to Vietnamese (display only), matched to their source tokens in document order. */
function translateChrome(root, tokens) {
  const heads = [], tables = [], items = [], paragraphs = [], codes = [];
  (function walk(list) {
    for (const t of list || []) {
      if (t.type === "heading") heads.push(t);
      else if (t.type === "table") tables.push(t);
      else if (t.type === "paragraph") paragraphs.push(t);
      else if (t.type === "code") codes.push(t);
      if (t.type === "list") t.items.forEach(i => { items.push(i); walk(i.tokens); });
      else if (t.type === "blockquote") walk(t.tokens);
    }
  })(tokens);
  const hs = root.querySelectorAll("h1, h2, h3, h4, h5, h6");
  if (hs.length === heads.length) hs.forEach((h, i) => { const v = tr(heads[i].text); if (v !== heads[i].text) h.innerHTML = inline(v); });
  const ts = root.querySelectorAll("table");
  if (ts.length === tables.length) ts.forEach((tb, i) => {
    tb.querySelectorAll("thead th").forEach((th, j) => {
      const src = (tables[i].header[j] || {}).text;
      if (src == null) return;
      const v = tr(src);
      if (v !== src) th.innerHTML = inline(v);
    });
    const cells = tables[i].rows.flat();
    tb.querySelectorAll("tbody td").forEach((td, j) => {
      const src = cells[j]?.text;
      if (src == null) return;
      const v = tr(src);
      if (v !== src) td.innerHTML = inline(v);
    });
  });
  items.forEach((item, i) => {
    const v = tr(item.text);
    if (v !== item.text) root.querySelectorAll("li")[i].innerHTML = inline(v);
  });
  root.querySelectorAll("p").forEach((p, i) => {
    const text = paragraphs[i]?.text;
    if (text == null) return;
    const v = tr(text);
    if (v !== text) p.innerHTML = inline(v);
  });
  root.querySelectorAll("pre > code").forEach((code, i) => {
    const text = codes[i]?.text;
    if (text == null) return;
    const v = tr(text);
    if (v !== text) code.textContent = v;
  });
}
const baseOf = path => path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
const srcLink = (path, label) => `<button type="button" class="linkish" data-file="${esc(path)}"><code>${esc(label || path)}</code></button>`;

function skillChip(name) {
  const s = IDX.skillByName[name] || { origin: "missing" };
  const [cls, lab] = ORIGIN[s.origin] || ORIGIN.missing;
  return `<button type="button" class="chip ${cls}" data-skill="${esc(name)}" aria-label="Mở skill ${esc(name)}, nguồn gốc ${esc(lab)}">${esc(name)}<span class="origin">${esc(lab)}</span></button>`;
}

function diagramFigure(name, sec) {
  const d = IDX.diagrams[name];
  const fig = document.createElement("div");
  fig.className = "diagram-block";
  if (!d) {
    fig.innerHTML = `<div class="callout risk" role="note"><p><span class="callout-label">Thiếu sơ đồ</span>Không có spec <code>diagrams/${esc(name)}.*.json</code>.</p></div>`;
    return fig;
  }
  const legend = d.legend.map(l => l.kind === "node"
    ? `<li><span class="swatch" style="--c: var(--tier-${esc(l.tier)})"></span>${esc(tr(l.label))}</li>`
    : `<li><span class="line${l.variant === "return" ? " async" : ""}"></span>${esc(tr(l.label))}</li>`).join("");
  const stale = d.stale ? `<div class="callout warn" role="note"><p><span class="callout-label">Cần render lại</span>Spec <code>${esc(d.spec)}</code> mới hơn <code>diagrams/${esc(name)}.html</code>: chạy lại pipeline archify của <code>frappe-docs</code>.</p></div>` : "";
  fig.innerHTML = `${stale}<figure class="diagram"><div class="diagram-slot" data-diagram="${esc(name)}"><p class="muted">Đang tải sơ đồ</p></div>
    <ul class="legend" aria-label="Chú thích">${legend}</ul>
    <figcaption>${esc(tr(d.title))}. Sơ đồ archify loại <code>${esc(d.type)}</code>, spec ${srcLink(d.spec)}.</figcaption>
    <details class="diagram-text"><summary>Bản chữ</summary><ul>${d.text.concat(d.links).map(t => `<li>${esc(tr(t))}</li>`).join("")}</ul></details></figure>
    ${d.html ? `<p class="muted"><a href="/diagrams/${esc(name)}.html" target="_blank" rel="noopener">Mở bản tương tác</a>: phóng to, tìm và lần theo từng mũi tên.</p>` : ""}`;
  loadDiagram(fig.querySelector("[data-diagram]"));
  return fig;
}
const embedCache = new Map();
async function loadDiagram(slot) {
  const name = slot.dataset.diagram;
  try {
    if (!embedCache.has(name)) embedCache.set(name, getText("/api/team/diagram?name=" + encodeURIComponent(name)));
    const html = await embedCache.get(name);
    const tpl = document.createElement("template");
    tpl.innerHTML = html;
    const walker = document.createTreeWalker(tpl.content, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const text = node.textContent.trim();
      const translated = tr(text);
      if (text && translated !== text) node.textContent = node.textContent.replace(text, translated);
    }
    slot.replaceWith(tpl.content);
  } catch (e) {
    embedCache.delete(name);
    slot.innerHTML = `<p class="muted">Không tải được sơ đồ: ${esc(e.message)}</p>`;
  }
}

function details(label, nodes) {
  const d = document.createElement("details");
  d.className = "diagram-text";
  d.innerHTML = `<summary>${esc(label)}</summary>`;
  const inner = document.createElement("div");
  inner.className = "details-body";
  nodes.forEach(n => inner.append(n));
  d.append(inner);
  return d;
}

function section(id, title) {
  const s = document.createElement("section");
  s.setAttribute("aria-labelledby", id);
  s.innerHTML = `<h3 id="${esc(id)}">${inline(tr(title))}</h3>`;
  return s;
}

/* ---------------------------------------------------------------- markdown file as sections */
async function renderMd(panel, block, tabId, first) {
  const path = block.md;
  const text = await fileText(path);
  if (!first && !block.diagrams) {  // extra file in a tab: one section, its own headings one level down
    const all = lex(text);
    const h1 = all.find(t => t.type === "heading" && t.depth === 1);
    const s = section(slug(path.replace(/\.md$/, "")), h1 ? h1.text : path);
    s.insertAdjacentHTML("beforeend", `<p class="muted">Nguồn: ${srcLink(path)}</p>`);
    s.append(mdBlock(shift(all.filter(t => t !== h1), d => d + 2), baseOf(path)));
    panel.append(s);
    return;
  }
  const tokens = shift(lex(text), d => d + 1);  // ## -> h3, ### -> h4
  tokens.links = tokens.links || {};
  // after shift, file H1 became depth 2 and ## became 3; split on the shifted levels
  const doc = { title: "", intro: [], sections: [] };
  let cur = null;
  for (const t of tokens) {
    if (t.type === "heading" && t.depth === 2 && !doc.title) { doc.title = t.text; continue; }
    if (t.type === "heading" && t.depth === 3) { cur = { title: t.text, tokens: [] }; doc.sections.push(cur); continue; }
    (cur ? cur.tokens : doc.intro).push(t);
  }
  const used = new Set();
  const anchors = block.diagrams || {};
  const pfx = slug(path.replace(/\.md$/, ""));
  if (first) {
    const head = document.createElement("div");
    head.className = "panel-head";
    head.innerHTML = `<h2>${esc(TAB_TITLE[tabId] || doc.title)}</h2>`;
    const introHasDiagram = anchors[""];
    if (!introHasDiagram && doc.intro.length) { const l = mdBlock(doc.intro, baseOf(path)); l.classList.add("lead"); head.append(l); }
    if (path !== "sizing.md") head.insertAdjacentHTML("beforeend", `<p class="muted">Nguồn: ${srcLink(path)}${doc.title ? ` (${inline(tr(doc.title))})` : ""}, đọc trực tiếp từ file nguồn.</p>`);
    panel.append(head);
  } else {
    const s = section(pfx, doc.title || path);
    s.insertAdjacentHTML("beforeend", `<p class="muted">Nguồn: ${srcLink(path)}</p>`);
    if (doc.intro.length && !anchors[""]) s.append(mdBlock(doc.intro, baseOf(path)));
    panel.append(s);
  }
  if (anchors[""]) {
    const s = section(pfx + "-intro", doc.title || path);
    anchors[""].forEach(n => s.append(diagramFigure(n)));
    if (doc.intro.length) s.append(details("Chi tiết", [mdBlock(doc.intro, baseOf(path))]));
    used.add("");
    panel.append(s);
  }
  for (const sec of doc.sections) {
    const s = section(pfx + "-" + slug(sec.title), sec.title);
    const diags = anchors[sec.title];
    let body = sec.tokens;
    if (block.configTable) body = configSection(s, body);
    if (diags) {
      used.add(sec.title);
      diags.forEach(n => s.append(diagramFigure(n)));
      s.append(details("Chi tiết", [mdBlock(body, baseOf(path))]));
    } else if (body.length) {
      s.append(mdBlock(body, baseOf(path)));
    }
    panel.append(s);
  }
  for (const [h, names] of Object.entries(anchors)) {
    if (used.has(h)) continue;
    const s = section(pfx + "-lost-" + slug(h), names.map(n => tr((IDX.diagrams[n] || {}).title || n)).join(", "));
    s.insertAdjacentHTML("beforeend", `<div class="callout warn" role="note"><p><span class="callout-label">Lệch nguồn</span>Không còn mục "${esc(h)}" trong <code>${esc(path)}</code>; sơ đồ hiện riêng ở đây. Sửa bảng TABS trong <code>app/team.js</code>.</p></div>`);
    names.forEach(n => s.append(diagramFigure(n)));
    panel.append(s);
  }
}

/* Config: the yaml example becomes the key table; the yaml stays in a collapsed block. */
function configSection(s, tokens) {
  const i = tokens.findIndex(t => t.type === "code" && /ya?ml/.test(t.lang || ""));
  if (i < 0 || !IDX.config_keys.length) return tokens;
  const rows = IDX.config_keys.map(k => `<tr><td><code>${esc(k.key)}</code></td><td>${k.comment ? inline(k.comment) : '<span class="muted">không ghi chú</span>'}</td><td>${k.value ? `<code>${esc(k.value)}</code>` : ""}</td></tr>`).join("");
  const before = tokens.slice(0, i), after = tokens.slice(i + 1);
  const wrap = document.createElement("div");
  wrap.className = "md";
  if (before.length) wrap.append(mdBlock(before, ""));
  const h = document.createElement("div");
  h.innerHTML = `<h4 id="cf-keys">Các khóa của <code>.team/config.yaml</code></h4><div class="table-wrap"><table><thead><tr><th scope="col">Khóa</th><th scope="col">Ý nghĩa (chú thích trong YAML)</th><th scope="col">Giá trị mẫu</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  wrap.append(...h.childNodes);
  wrap.append(details("YAML mẫu", [mdBlock([tokens[i]], "")]));
  if (after.length) wrap.append(mdBlock(after, ""));
  s.append(wrap);
  return [];
}

/* A diagram that stands for a section in another file. */
async function renderDiagramBlock(panel, block) {
  const s = section("dg-" + block.diagram, block.title);
  s.append(diagramFigure(block.diagram));
  const parts = [];
  for (const [path, prefix] of block.detail || []) {
    try {
      const sec = sectionByPrefix(lex(await fileText(path)), prefix);
      if (!sec) { parts.push(Object.assign(document.createElement("p"), { className: "muted", textContent: `Không còn mục "${prefix}" trong ${path}.` })); continue; }
      const note = document.createElement("p");
      note.className = "muted";
      note.innerHTML = `Từ ${srcLink(path)}, mục "${inline(tr(sec.title))}":`;
      parts.push(note, mdBlock(shift(sec.tokens, d => d + 1), baseOf(path)));
    } catch (e) { parts.push(Object.assign(document.createElement("p"), { className: "muted", textContent: e.message })); }
  }
  if (parts.length) s.append(details("Chi tiết", parts));
  panel.append(s);
}

function renderScenarios(panel) {
  const kept = (IDX.kept_line || "").toLowerCase();
  const s = section("dc-scenarios", "Kịch bản archify");
  s.insertAdjacentHTML("beforeend", `<p>Mọi kịch bản archify làm được, đọc từ <code>${esc(IDX.skills_dir)}/archify/recipes/scenarios.mjs</code>. Nhãn Giữ lại theo dòng Kept diagrams trong ${srcLink("docs-policy.md")}; còn lại vẽ khi cần và không lưu.</p>`);
  if (IDX.kept_line) s.append(Object.assign(mdBlock(lex(IDX.kept_line.replace(/^- /, "")), ""), { className: "md callout decision" }));
  const types = [...new Set(IDX.scenarios.map(r => r.type))];
  for (const t of types) {
    const sub = document.createElement("div");
    sub.className = "subsection";
    sub.innerHTML = `<h4 id="dc-${esc(t)}"><code>${esc(t)}</code></h4><div class="grid">${IDX.scenarios.filter(r => r.type === t).map(r => {
      const byTitle = kept.includes((r.title || "").toLowerCase()), byType = !byTitle && kept.includes(" " + t + " ");
      return `<article class="card"><h5>${esc(tr(r.title))}</h5><div class="chips"><span class="chip neutral">${esc(t)}</span>${byTitle ? '<span class="chip ok">Giữ lại</span>' : byType ? `<span class="chip info">Loại ${esc(t)} được giữ khi đúng điều kiện</span>` : ""}</div>
        <p><strong>Trả lời:</strong> ${esc(r.question || "")}</p>${r.summary ? `<p>${esc(r.summary)}</p>` : ""}
        ${r.useWhen ? `<p><strong>Dùng khi:</strong> ${esc(r.useWhen)}</p>` : ""}${r.avoidWhen ? `<p><strong>Tránh khi:</strong> ${esc(r.avoidWhen)}</p>` : ""}
        <p class="muted">Kịch bản <code>${esc(r.id)}</code></p></article>`;
    }).join("")}</div>`;
    s.append(sub);
  }
  if (!IDX.scenarios.length) s.insertAdjacentHTML("beforeend", '<p class="muted">Không đọc được scenarios.mjs.</p>');
  panel.append(s);
}

/* ---------------------------------------------------------------- Vai trò */
async function renderRoles(panel) {
  const head = document.createElement("div");
  head.className = "panel-head";
  head.innerHTML = `<h2>Vai trò</h2>`;
  panel.append(head);
  // PO: the Roster bullet in README
  const po = section("role-group-po", "PO (người)");
  try {
    const r = sectionByPrefix(lex(await fileText("README.md")), "Roster");
    const item = r && r.tokens.flatMap(t => t.type === "list" ? t.items : []).find(i => /Product Owner/.test(i.text));
    if (item) po.append(mdBlock(lex(item.text), ""));
  } catch (e) { po.insertAdjacentHTML("beforeend", `<p class="muted">${esc(e.message)}</p>`); }
  panel.append(po);
  const placed = new Set();
  const groups = GROUPS.concat([["other", "Khác", IDX.roles.map(r => r.id).filter(id => !GROUPS.some(g => g[2].includes(id)))]]);
  for (const [gid, label, ids] of groups) {
    const roles = ids.map(id => IDX.roleById[id]).filter(Boolean);
    if (!roles.length) continue;
    roles.forEach(r => placed.add(r.id));
    const s = section("role-group-" + gid, label);
    if (gid === "maint") s.insertAdjacentHTML("beforeend", `<p>Vai trò chỉ có trong bảo trì, định nghĩa trong ${srcLink("maintenance.md")}.</p>`);
    s.insertAdjacentHTML("beforeend", `<div class="grid">${roles.map(roleCard).join("")}</div>`);
    panel.append(s);
  }
}
function roleCard(r) {
  const slots = r.slots.length ? `<p class="slot-prof">${r.slots.map(slot => `<code>{${esc(slot)}}</code>`).join(" ")}</p>` : "";
  return `<article class="card" id="role-${esc(r.id)}"><h4>${esc(tr(r.title))}</h4>${r.summary ? `<p>${inline(r.summary)}</p>` : ""}
    ${r.runs_on ? `<p class="card-meta"><strong>Chạy trên:</strong> ${inline(r.runs_on)}</p>` : ""}
    <p class="card-meta"><strong>Tier model:</strong> ${r.tier ? esc(TIER_LABEL[r.tier]) : "thẻ vai trò không ghi tier"}</p>
    ${r.skills.length ? `<div class="chips">${r.skills.map(skillChip).join("")}</div>` : ""}${slots}
    <p><button type="button" class="linkish" data-role="${esc(r.id)}">Xem thẻ vai trò</button></p></article>`;
}

/* ---------------------------------------------------------------- Skills */
function renderSkills(panel) {
  const opts = GROUPS.map(([, label, ids]) => {
    const rs = ids.filter(id => IDX.roleById[id]);
    return rs.length ? `<optgroup label="${esc(label.split(":")[0])}">${rs.map(id => `<option value="${esc(id)}">${esc(roleTitle(id))}</option>`).join("")}</optgroup>` : "";
  }).join("");
  panel.innerHTML = `<div class="panel-head"><h2>Skill</h2></div>
  <div class="filters" role="search"><div class="field field-grow"><label for="sk-q">Tìm skill</label><input id="sk-q" type="search" placeholder="Tên, mô tả, nội dung" autocomplete="off"></div>
  <div class="field"><label for="sk-role">Vai trò</label><select id="sk-role"><option value="">Mọi vai trò</option>${opts}</select></div>
  </div>
  <div class="table-wrap"><table id="skill-table"><thead><tr><th scope="col">Skill</th><th scope="col">Mô tả</th><th scope="col">Vai trò</th><th scope="col">Nguồn gốc</th></tr></thead><tbody>${IDX.skills.map(s => {
    const [cls, lab] = ORIGIN[s.origin] || ORIGIN.missing;
    return `<tr data-name="${esc(s.name)}" data-roles="${esc(s.roles.join(" "))}" data-text="${esc((s.name + " " + s.description + " " + s.roles.map(roleTitle).join(" ")).toLowerCase())}"><td><button type="button" class="linkish" data-skill="${esc(s.name)}">${esc(s.name)}</button></td><td>${esc(s.description) || '<span class="muted">không có mô tả</span>'}</td><td>${s.roles.map(r => esc(roleTitle(r))).join(", ")}</td><td><div class="chips"><span class="chip ${cls}">${esc(lab)}</span><span class="muted">${esc(s.source)}</span></div></td></tr>`;
  }).join("")}</tbody></table></div><p class="muted" id="skill-empty" hidden>Không có skill nào khớp.</p>`;
  const rows = [...panel.querySelectorAll("#skill-table tbody tr")];
  const q = panel.querySelector("#sk-q"), rsel = panel.querySelector("#sk-role");
  const emptyEl = panel.querySelector("#skill-empty");
  let bodyHits = null, seq = 0, timer = null;
  function filter() {
    const words = q.value.trim().toLowerCase().split(/\s+/).filter(Boolean), role = rsel.value;
    let n = 0;
    rows.forEach(tr => {
      const okText = !words.length || words.every(w => tr.dataset.text.includes(w)) || (bodyHits && bodyHits.has(tr.dataset.name));
      const okRole = !role || tr.dataset.roles.split(" ").includes(role);
      tr.hidden = !(okText && okRole);
      if (!tr.hidden) n++;
    });
    emptyEl.hidden = n > 0;
  }
  q.addEventListener("input", () => {
    bodyHits = null; filter();
    clearTimeout(timer);
    const v = q.value.trim(), my = ++seq;
    if (!v) return;
    timer = setTimeout(async () => {  // full-text search over SKILL.md bodies, server side
      try {
        const names = await getJSON("/api/team/search?q=" + encodeURIComponent(v) + "&names=" + encodeURIComponent(rows.map(r => r.dataset.name).join(",")));
        if (my === seq) { bodyHits = new Set(names); filter(); }
      } catch (e) { /* local filter stays */ }
    }, 200);
  });
  rsel.addEventListener("change", filter);
  filter();
}

/* ---------------------------------------------------------------- side panel */
const sheet = () => $("#sheet");
function openSheet(title, build) {
  const dlg = sheet(), body = $("#sheet-body");
  $("#sheet-title").textContent = title;
  body.replaceChildren(Object.assign(document.createElement("p"), { className: "muted", textContent: "Đang tải" }));
  if (!dlg.open) dlg.showModal();
  dlg.scrollTop = 0;
  $("#sheet-close").focus();
  Promise.resolve().then(build).then(nodes => { if ($("#sheet-title").textContent === title) body.replaceChildren(...nodes); })
    .catch(e => body.replaceChildren(Object.assign(document.createElement("p"), { className: "muted", textContent: "Lỗi: " + e.message })));
}
function kv(pairs) {
  const dl = document.createElement("dl");
  dl.className = "kv";
  dl.innerHTML = pairs.filter(p => p[1]).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join("");
  return dl;
}
async function openRole(id) {
  await index();
  const r = IDX.roleById[id];
  if (!r) return;
  openSheet(tr(r.title), async () => {
    const text = await fileText(r.file);
    let tokens = lex(text);
    if (r.maintenance) { const sec = sectionByPrefix(tokens, r.title); tokens = sec ? shift(sec.tokens, d => d - 1) : tokens; }
    tokens = tokens.filter(t => !(t.type === "heading" && t.depth === 1));
    shift(tokens, d => d + 1);
    const chips = document.createElement("div");
    chips.className = "chips";
    chips.innerHTML = r.skills.map(skillChip).join("");
    return [kv([["Nguồn", srcLink(r.file)], ["Nhóm", esc((GROUPS.find(g => g[0] === groupOf(id)) || [, "Khác"])[1])], ["Tier model", r.tier ? esc(r.tier) : ""], ["Slot", r.slots.map(s => `<code>{${esc(s)}}</code>`).join(" ")]]), chips, mdBlock(tokens, "roles")];
  });
}
async function openSkill(name) {
  await index();
  openSheet(name, async () => {
    const s = await getJSON("/api/team/skill?name=" + encodeURIComponent(name));
    const meta = IDX.skillByName[name] || { roles: [] };
    const [cls, lab] = ORIGIN[s.origin] || ORIGIN.missing;
    const out = [kv([
      ["Nguồn gốc", `<span class="chip ${cls}">${esc(lab)}</span> <span class="muted">${esc(s.source)}</span>`],
      ["Mô tả", esc(s.description || meta.description || "")],
      ["Vai trò", meta.roles.map(r => esc(roleTitle(r))).join(", ")],
      ["Đường dẫn", s.path ? `<code>${esc(s.path)}</code>` : ""],
      ["references/", s.refs.length ? s.refs.map(f => `<code>${esc(f)}</code>`).join(" ") : ""],
    ])];
    if (s.body) {
      const tokens = shift(lex(s.body), d => d + 2);  // # -> h3, ## -> h4, ### -> h5
      out.push(mdBlock(tokens, ""));
    } else {
      out.push(Object.assign(document.createElement("div"), { className: "callout warn", innerHTML: `<p><span class="callout-label">Không có nội dung</span>Skill này không có trong shared hub <code>${esc(IDX.skills_dir)}</code>${s.path ? `; bản gốc ở <code>${esc(s.path)}</code>` : ""}. Agent ngoài Hermes không đọc được nó theo tên.</p>` }));
    }
    return out;
  });
}
async function openFile(path) {
  openSheet(path, async () => {
    const text = await fileText(path);
    const isMd = path.endsWith(".md");
    const tokens = isMd ? shift(lex(text), d => d + 1) : lex("```" + (path.endsWith(".json") ? "json" : "yaml") + "\n" + text + "\n```");
    return [kv([["Nguồn", `<code>${esc(IDX.team_home)}/${esc(path)}</code>`]]), mdBlock(tokens, baseOf(path))];
  });
}

/* ---------------------------------------------------------------- tab rendering */
const rendered = new Map();
export function renderTab(panel) {
  const id = panel.id;
  if (rendered.has(id)) return rendered.get(id);
  const p = (async () => {
    await index();
    const frag = document.createElement("div");
    frag.className = "tab-body";
    if (id === "vai-tro") await renderRoles(frag);
    else if (id === "skills") renderSkills(frag);
    else {
      let first = true;
      for (const block of TABS[id] || []) {
        if (block.md) await renderMd(frag, block, id, first);
        else if (block.diagram) await renderDiagramBlock(frag, block);
        else if (block.scenarios) renderScenarios(frag);
        first = false;
      }
    }
    if (["tong-quan", "flow", "co-viec"].includes(id)) frag.querySelectorAll("details.diagram-text, figure.diagram figcaption").forEach(el => el.remove());
    if (id === "tong-quan") frag.querySelectorAll(".panel-head > p.muted").forEach(el => el.remove());
    panel.replaceChildren(...frag.childNodes);
  })().catch(e => {
    rendered.delete(id);
    panel.innerHTML = `<div class="callout risk" role="note"><p><span class="callout-label">Lỗi</span>Không tải được nội dung: ${esc(e.message)}</p></div>`;
  });
  rendered.set(id, p);
  return p;
}
export const isTeamTab = id => id in TABS || id === "vai-tro" || id === "skills";

export function initTeam() {
  document.addEventListener("click", e => {
    const f = e.target.closest("[data-file]");
    if (f) { e.preventDefault(); openFile(f.dataset.file); return; }
    const sk = e.target.closest("[data-skill]");
    if (sk) { openSkill(sk.dataset.skill); return; }
    const ro = e.target.closest("[data-role]");
    if (ro) openRole(ro.dataset.role);
  });
  const dlg = sheet();
  $("#sheet-close").addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", e => {
    if (e.target !== dlg) return;
    const r = dlg.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dlg.close();
  });
}
