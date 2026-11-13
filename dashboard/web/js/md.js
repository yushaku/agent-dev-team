/* Markdown helpers: one vendored renderer (marked), raw HTML escaped, headings shifted. */
import { Marked } from "/vendor/marked.min.js";

export const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const SAFE_URL = /^(https?:|mailto:|#|\/|\.{0,2}[\w~-])/i;

const md = new Marked({
  gfm: true,
  renderer: {
    html(token) { return esc(token.text); },
    link(token) {
      const text = this.parser.parseInline(token.tokens);
      const href = token.href || "";
      if (!SAFE_URL.test(href) || /^javascript:/i.test(href)) return text;
      const ext = /^https?:/i.test(href);
      return `<a href="${esc(href)}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ""}>${text}</a>`;
    },
    image(token) { return esc(token.text || token.href); },
  },
});

export const lex = text => md.lexer(text || "");

/* Shift heading depths in place: map(depth) returns the new depth (clamped to 2..6). */
export function shift(tokens, map) {
  for (const t of tokens) if (t.type === "heading") t.depth = Math.min(6, Math.max(2, map(t.depth)));
  return tokens;
}

export function parse(tokens) {
  const list = Object.assign([...tokens], { links: tokens.links || {} });
  return md.parser(list);
}

export const inline = text => md.parseInline(text || "");

/* Tokens under the first heading (any depth) whose text starts with `prefix`, up to the next heading at the same or a higher level. */
export function sectionByPrefix(tokens, prefix) {
  const i = tokens.findIndex(t => t.type === "heading" && t.text.startsWith(prefix));
  if (i < 0) return null;
  const d = tokens[i].depth, out = [];
  for (let j = i + 1; j < tokens.length; j++) {
    if (tokens[j].type === "heading" && tokens[j].depth <= d) break;
    out.push(tokens[j]);
  }
  return { title: tokens[i].text, depth: d, tokens: out };
}

export const slug = s => String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/* After insertion: wrap tables and code blocks in frappe components, turn team file paths into side-panel links. */
export function decorate(root, { files = new Set(), base = "" } = {}) {
  root.querySelectorAll("table").forEach(t => {
    if (t.parentElement.classList.contains("table-wrap")) return;
    const w = document.createElement("div"); w.className = "table-wrap"; t.replaceWith(w); w.append(t);
  });
  root.querySelectorAll("pre").forEach(pre => {
    if (pre.parentElement.tagName === "FIGURE") return;
    const fig = document.createElement("figure"); fig.className = "code";
    const code = pre.querySelector("code"), lang = code && (code.className.match(/language-(\S+)/) || [])[1];
    if (lang) { const cap = document.createElement("figcaption"); cap.textContent = lang; fig.append(cap); }
    pre.replaceWith(fig); fig.append(pre);
  });
  const resolve = p => {
    p = p.replace(/^(~\/\.agents\/teams|\$AGENT_TEAM_HOME)\//, "").replace(/^\.\//, "").split("#")[0];
    if (files.has(p)) return p;
    const rel = (base ? base + "/" : "") + p;
    const parts = [];
    for (const s of rel.split("/")) { if (s === "..") parts.pop(); else if (s && s !== ".") parts.push(s); }
    const n = parts.join("/");
    return files.has(n) ? n : null;
  };
  root.querySelectorAll(":not(pre) > code").forEach(c => {
    if (c.closest("a, button")) return;
    const f = resolve(c.textContent.trim());
    if (!f) return;
    const b = document.createElement("button");
    b.type = "button"; b.className = "linkish"; b.dataset.file = f; b.setAttribute("aria-label", "Mở " + f);
    c.replaceWith(b); b.append(c);
  });
  root.querySelectorAll("a[href]").forEach(a => {
    const h = a.getAttribute("href");
    if (/^(https?:|mailto:|#|\/)/i.test(h)) return;
    const f = resolve(h);
    if (f) { a.dataset.file = f; a.setAttribute("href", "#"); }
  });
}
