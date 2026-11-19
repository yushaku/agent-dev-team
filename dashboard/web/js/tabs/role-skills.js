import { esc, A, svg, fill, fig, roleCol, GROUPS, groupOf, sessionCount, dt, cut, widthOf, r1 } from "../lib/charts.js";

/* role -> skill -> { n loads, sess Set, tasks Set, last }. Same counting as the Skills tab: agent loads, plus one per session for hook-injected skills. */
export function roleSkillStats(S) {
  const by = {};
  const add = (s, k, n, ts) => {
    const r = ((by[s.role] = by[s.role] || {})[k] = by[s.role][k] || { n: 0, sess: new Set(), tasks: new Set(), last: 0 });
    r.n += n; r.sess.add(s.agent + ":" + (s.session_id || s.id)); if (s.task_id) r.tasks.add(s.task_id); r.last = Math.max(r.last, ts || 0);
  };
  S.forEach(s => {
    Object.entries(s.skills || {}).forEach(([k, v]) => add(s, k, v[0], v[1]));
    Object.keys(s.hooks || {}).forEach(k => { if (!(s.skills || {})[k]) add(s, k, 1, s.start); });
  });
  return by;
}
export function renderRoleSkills(S) {
  const by = roleSkillStats(S), tot = (o) => Object.values(o).reduce((t, r) => t + r.n, 0);
  const roles = Object.keys(by).sort((a, b) => tot(by[b]) - tot(by[a]) || a.localeCompare(b));
  const sk = {};
  roles.forEach(r => Object.entries(by[r]).forEach(([k, v]) => { sk[k] = (sk[k] || 0) + v.n; }));
  const skills = Object.keys(sk).sort((a, b) => sk[b] - sk[a] || a.localeCompare(b));
  let body = "";
  if (roles.length && skills.length) {
    const CW = 52, RH = 28, LW = 170, hdr = 12 + Math.min(150, Math.max(...skills.map(k => Math.min(k.length, 24))) * 6 + 12);
    const W = Math.max(widthOf("#c-role-skills"), LW + skills.length * CW + 60), H = hdr + roles.length * RH + 8;
    const max = Math.max(...roles.flatMap(r => Object.values(by[r]).map(v => v.n))), g = [];
    skills.forEach((k, j) => {
      const x = LW + j * CW + CW / 2;
      g.push(`<text transform="translate(${r1(x)} ${hdr - 8}) rotate(-45)" text-anchor="start" class="v"${A({ skill: k, tip: [k, "Tổng: " + sk[k] + " lần nạp", "Bấm để đọc skill"] })}>${esc(cut(k, 24))}</text>`);
    });
    roles.forEach((r, i) => {
      const y = hdr + i * RH, X = by[r];
      g.push(`<rect x="0" y="${y + RH / 2 - 5}" width="10" height="10" rx="2" ${fill(roleCol(r))}/><text x="16" y="${y + RH / 2 + 4}" class="v"${A({ f: "role:" + r, tip: [`${r} (${GROUPS[groupOf(r)][0]})`, tot(X) + " lần nạp, " + Object.keys(X).length + " skill", "Bấm để lọc"] })}>${esc(cut(r, 22))}</text>`);
      skills.forEach((k, j) => {
        const v = X[k], x = LW + j * CW;
        if (!v) { g.push(`<rect x="${x + 1}" y="${y + 1}" width="${CW - 2}" height="${RH - 2}" rx="3" style="fill:var(--surface0);fill-opacity:.35"/>`); return; }
        const p = Math.round(20 + 75 * v.n / max);
        g.push(`<rect x="${x + 1}" y="${y + 1}" width="${CW - 2}" height="${RH - 2}" rx="3" style="fill:color-mix(in srgb, var(--blue) ${p}%, var(--surface0))"${A({ tip: [`Vai: ${r}`, `Skill: ${k}`, v.n + " lần nạp", v.sess.size + " phiên" + (v.tasks.size ? ", " + v.tasks.size + " task" : ""), "Dùng lần cuối: " + dt(v.last)] })}/><text x="${x + CW / 2}" y="${y + RH / 2 + 4}" text-anchor="middle" class="${p > 55 ? "ink" : "v"}" style="pointer-events:none">${v.n}</text>`);
      });
    });
    body = svg(W, H, "Bảng nhiệt số lần nạp skill theo vai", g.join("")).replace("<svg ", `<svg style="min-width:${W}px" `);
  }
  fig("#c-role-skills", { title: "Skill theo vai", subtitle: "Vai nào nạp skill nào trong các task đang lọc; chọn một Run để xem riêng Run đó", body, empty: "Chưa có skill nào được nạp trong các phiên đang lọc.", caption: "Mỗi ô là số lần vai đó nạp skill: mỗi lần agent đọc SKILL.md hoặc gọi công cụ Skill, cộng một lần mỗi phiên khi hook nạp sẵn. Ô trống là 0 lần; màu đậm hơn là nhiều lần hơn. Skill nạp trước khi một task bắt đầu trong phiên dùng lại được gán theo quy tắc phân phiên của backend. Bấm tên vai để lọc." });
}
