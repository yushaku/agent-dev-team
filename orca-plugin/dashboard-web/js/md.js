/* Markdown helpers for the skill panel: one vendored renderer (marked), raw HTML escaped, headings shifted. */
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

/* After insertion: wrap tables and code blocks in their styled containers. */
export function decorate(root) {
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
}
