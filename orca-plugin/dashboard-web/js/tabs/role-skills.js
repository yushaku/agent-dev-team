import { esc, A, fig, roleCol, GROUPS, groupOf, dt } from "../lib/charts.js";

/* role -> skill -> { n loads, sess Set, tasks Set, last }. Same counting as the Skills tab: agent loads, plus one per session for hook-injected skills. */
export function roleSkillStats(S) {
  const by = {};
  const add = (s, k, n, ts) => {
    const r = ((by[s.role] = by[s.role] || {})[k] = by[s.role][k] || { n: 0, sess: new Set(), tasks: new Set(), last: 0 });
    r.n += n;
    r.sess.add(s.agent + ":" + (s.session_id || s.id));
    if (s.task_id) r.tasks.add(s.task_id);
    r.last = Math.max(r.last, ts || 0);
  };
  S.forEach((s) => {
    Object.entries(s.skills || {}).forEach(([k, v]) => add(s, k, v[0], v[1]));
    Object.keys(s.hooks || {}).forEach((k) => {
      if (!s.skills?.[k]) add(s, k, 1, s.start);
    });
  });
  return by;
}
export function renderRoleSkills(S) {
  const by = roleSkillStats(S),
    tot = (o) => Object.values(o).reduce((t, r) => t + r.n, 0);
  const roles = Object.keys(by).sort((a, b) => tot(by[b]) - tot(by[a]) || a.localeCompare(b));
  let body = "";
  if (roles.length) {
    body = `<ul class="role-skills" aria-label="Skill đã nạp theo vai">${roles
      .map((r) => {
        const X = by[r],
          chips = Object.entries(X)
            .sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]))
            .map(([k, v]) => {
              return `<span class="rs-chip"${A({ skill: k, tip: [`Vai: ${r}`, `Skill: ${k}`, v.n + " lần nạp", v.sess.size + " phiên" + (v.tasks.size ? ", " + v.tasks.size + " task" : ""), "Dùng lần cuối: " + dt(v.last), "Bấm để đọc skill"] })}>${esc(k)} <b>${v.n}</b></span>`;
            })
            .join("");
        return `<li><span class="rs-role"${A({ f: "role:" + r, tip: [`${r} (${GROUPS[groupOf(r)][0]})`, tot(X) + " lần nạp, " + Object.keys(X).length + " skill", "Bấm để lọc"] })}><i style="background:${roleCol(r)}"></i>${esc(r)}</span><span class="rs-chips">${chips}</span></li>`;
      })
      .join("")}</ul>`;
  }
  fig("#c-role-skills", {
    title: "Skill theo vai",
    subtitle: "Vai nào nạp skill nào trong các task đang lọc; chọn một Run để xem riêng Run đó",
    body,
    empty: "Chưa có skill nào được nạp trong các phiên đang lọc.",
    caption:
      "Số cạnh tên skill là số lần vai đó nạp: mỗi lần agent đọc SKILL.md hoặc gọi công cụ Skill, cộng một lần mỗi phiên khi hook nạp sẵn. Skill nạp trước khi một task bắt đầu trong phiên dùng lại được gán theo quy tắc phân phiên của backend. Bấm tên vai để lọc, bấm skill để đọc.",
  });
}
