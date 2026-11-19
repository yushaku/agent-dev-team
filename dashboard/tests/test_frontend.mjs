import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { SourceTextModule, SyntheticModule } from "node:vm";

const elements = new Map();
function element(id) {
  if (!elements.has(id)) elements.set(id, {
    id, style: {}, innerHTML: "", textContent: "", title: "", listeners: {},
    showModal() { this.open = true; }, close() { this.open = false; },
    setAttribute() {}, addEventListener(event, fn) { this.listeners[event] = fn; },
  });
  return elements.get(id);
}
globalThis.document = {
  querySelector: element,
  querySelectorAll: s => s === ".dash-view" ? ["tk-tong-quan", "tk-theo-repo", "tk-skills", "tk-search", "tk-cach-tinh"].map(element) : [],
  addEventListener() {},
};
globalThis.window = { innerWidth: 1000, addEventListener() {} };
globalThis.localStorage = { getItem() { return null; }, setItem() {} };
globalThis.location = { hash: "" };
globalThis.history = { replaceState() {} };

const C = await import("../web/js/lib/charts.js");
const { repoTree } = await import("../web/js/tabs/repos.js");
const { renderRoles, roleStats } = await import("../web/js/tabs/roles.js");
const { renderRoleSkills } = await import("../web/js/tabs/role-skills.js");
const { runDetail, renderRunTimeline, communicationDiagram } = await import("../web/js/tabs/runs.js");
const { renderOverall } = await import("../web/js/tabs/overall.js");
const { renderTaskRoleSearch, renderSearch, toggleSearchKind } = await import("../web/js/tabs/search.js");

test("role charts resolve model colours after rebuilding the palette", () => {
  const sessions = ["a", "b"].map(model => ({
    role: "builder", agent: "codex", model, mix: { [model + "|high"]: 1 },
    total: 1, ctx: [1],
  }));
  C.state.data = { sessions, roles_cfg: { tiers: {}, order: [], roles: {} } };
  C.buildMixColours();
  renderRoles(sessions);
  assert.match(element("#c-roles").innerHTML, /<svg/);
  assert.match(element("#c-roles").innerHTML, /builder/);
});

test("role skill matrix counts agent loads and hook injections per role", () => {
  C.state.data = { sessions: [], roles_cfg: { tiers: {}, order: [], roles: {} } };
  const sessions = [
    { role: "builder", agent: "codex", session_id: "a", task_id: "t1", start: 5, skills: { tdd: [3, 10] }, hooks: { tdd: 1, ponytail: 1 } },
    { role: "reviewer", agent: "claude", session_id: "b", task_id: "t2", start: 6, skills: {}, hooks: {} },
  ];
  renderRoleSkills(sessions);
  const html = element("#c-role-skills").innerHTML;
  assert.match(html, /<svg/);
  assert.match(html, /builder/);
  assert.match(html, /tdd/);
  assert.match(html, /ponytail/);
  assert.doesNotMatch(html, /reviewer/);
  renderRoleSkills([sessions[1]]);
  assert.match(element("#c-role-skills").innerHTML, /Chưa có skill/);
});

test("Tasks shows code-search usage by role only after filtering a project", () => {
  C.state.repo = "dashboard";
  const sessions = [
    { role: "builder", search: { codegraph: 2, rg: 1 } },
    { role: "builder", search: { grep: 3 } },
    { role: "reviewer", search: { find: 1 } },
  ];
  renderTaskRoleSearch(sessions);
  assert.equal(element("#task-search").hidden, false);
  assert.match(element("#c-task-search").innerHTML, /Tool search code/);
  assert.match(element("#c-task-search").innerHTML, /builder/);
  assert.match(element("#c-task-search").innerHTML, /reviewer/);

  C.state.repo = "";
  renderTaskRoleSearch(sessions);
  assert.equal(element("#task-search").hidden, true);
});

test("load distinguishes fetch failures from render failures and recovers", async () => {
  let renderError;
  const rendered = [];
  const dash = new SourceTextModule(await readFile(new URL("../web/js/dash.js", import.meta.url), "utf8"));
  await dash.link(specifier => {
    const exports = specifier === "./lib/charts.js" ? C : {
      renderOverall() { rendered.push("timeline"); }, renderOverview() { rendered.push("overview"); if (renderError) throw renderError; },
      renderRoles() { rendered.push("roles"); }, renderRoleSkills() { rendered.push("role-skills"); }, renderRepos() { rendered.push("repos"); }, renderSessionCharts() { rendered.push("sessions"); },
      showSession() {}, renderSkills() { rendered.push("skills"); }, renderRtkCommands() { rendered.push("rtk-commands"); }, renderSearch() { rendered.push("search"); }, renderTaskRoleSearch() { rendered.push("task-search"); }, toggleSearchKind() { return true; },
    };
    return new SyntheticModule(Object.keys(exports), function () {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    });
  });
  await dash.evaluate();
  const load = element("#refresh").listeners.click;
  const data = { sessions: [], orca: { runs: [] }, generated_at: 1 };
  const originalFetch = globalThis.fetch, originalError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  try {
    globalThis.fetch = async () => ({ ok: false, status: 503 });
    await load();
    assert.equal(element("#updated").textContent, "Lỗi tải dữ liệu");
    assert.match(element("#auto").title, /HTTP 503/);
    assert.equal(C.state.loading, false);

    globalThis.fetch = async () => ({ ok: true, json: async () => data });
    renderError = new ReferenceError("missing chart binding");
    await load();
    assert.equal(element("#updated").textContent, "Lỗi hiển thị");
    assert.match(element("#updated").title, /missing chart binding/);
    assert.ok(logged.some(args => args.includes(renderError)));
    assert.equal(C.state.loading, false);

    renderError = null;
    rendered.length = 0;
    await load();
    assert.deepEqual(rendered, ["overview"]);
    assert.doesNotMatch(element("#updated").textContent, /Lỗi/);
    assert.equal(element("#updated").title, "");
    assert.equal(C.state.err, "");
    assert.equal(element("#refresh").disabled, false);
    rendered.length = 0;
    dash.namespace.showView("tk-theo-repo", { hash: false });
    assert.deepEqual(rendered.sort(), ["repos", "role-skills", "roles", "sessions", "task-search", "timeline"]);
    rendered.length = 0;
    dash.namespace.showView("tk-skills", { hash: false });
    assert.deepEqual(rendered, ["skills"]);
    rendered.length = 0;
    dash.namespace.showView("tk-search", { hash: false });
    assert.deepEqual(rendered.sort(), ["rtk-commands", "search"]);
    rendered.length = 0;
    dash.namespace.showView("tk-cach-tinh", { hash: false });
    assert.deepEqual(rendered, []);
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalError;
  }
});

test("fix tasks sharing a round count as one round; Gate 1 is not delivery", () => {
  const tasks = [
    { id: "a", title: "builder: fix a", status: "completed", measurement: { kind: "fix", round: 1, source: "metadata" } },
    { id: "b", title: "builder: fix b", status: "completed", measurement: { kind: "fix", round: 1, source: "metadata" } },
    { id: "c", title: "fix: legacy", status: "completed", measurement: { kind: "fix", round: null, source: "title" } },
  ];
  const info = runDetail({ tasks, gates: [{ kind: "approve", stage: "spec" }], stage: "unknown" });
  assert.equal(info.fix, 3);
  assert.equal(info.rounds, 1);
  assert.equal(info.unknownRounds, 1);
  assert.equal(info.estimated, 1);
  assert.match(info.st[1], /chưa rõ delivery/);
});

test("run timeline stays hidden when filtered sessions have no Run", () => {
  C.state.repo = C.state.wt = C.state.agent = C.state.role = C.state.runF = "";
  C.state.data = {
    sessions: [], generated_at: 1000, range_start: 1,
    orca: { available: true, error: null, runs: [{
      id: "run_a", objective: "test", created: 100, repo: "test", stage: "unknown",
      tasks: [], gates: [{ kind: "approve", stage: "spec" }], tokens: { codex: 20, sessions: 1 },
      window_tokens: { codex: 10 }, orchestrator_by_agent: { codex: 5 },
    }] },
  };
  const s = { id: "s", session_id: "s", total: 10, calls: 1, role: "orchestrator", agent: "codex", run_id: null };
  renderOverall([s]);
  assert.equal(element("#overall-timeline").hidden, true);
});

test("run timeline distinguishes blocked and queued tasks from running work", () => {
  C.state.data = { generated_at: 1000 };
  const tasks = ["blocked", "pending", "in_progress", "completed"].map((status, n) => ({
    id: String(n), title: "Task " + status, role: "builder", status,
    created: 100, started: status === "pending" ? null : 200,
    completed: status === "completed" ? 500 : null, tokens: {},
  }));
  const r = { id: "timeline", objective: "Test run", created: 100, repo: "test", tasks, gates: [], tokens: {} };
  C.gantt(runDetail(r), () => 0, "", "#timeline");
  const html = element("#timeline").innerHTML;
  assert.match(html, /Bị chặn/);
  assert.match(html, /Chưa chạy/);
  assert.match(html, /Đang chạy/);
  assert.match(html, /Đã xong/);
  assert.match(html, /min-width:760px/);
  assert.doesNotMatch(html, /Vai builder, bấm để lọc/);
});

test("token timeline chains consumption in task order to the run total", () => {
  C.state.data = { generated_at: 1000 };
  const tasks = [3, 5].map((v, n) => ({ id: String(n), title: "T" + n, role: "builder", status: "completed", created: 100 + n, started: 100 + n, completed: 200, tokens: { codex: v * 1e6 } }));
  const r = { id: "tk", objective: "Tok", created: 100, repo: "test", tasks, gates: [], tokens: {}, orchestrator_by_agent: { codex: 2e6 } };
  C.tokenTimeline(runDetail(r), t => t.tokens.codex || 0, "", "#tok");
  const html = element("#tok").innerHTML;
  assert.match(html, /Token theo thứ tự task/);
  assert.match(html, /Orchestrator/);
  assert.match(html, /Tổng: 10M token/);
  assert.equal((html.match(/<rect /g) || []).length, 3);
  const bars = [...html.matchAll(/<rect x="([\d.]+)"[^>]*width="([\d.]+)"/g)].map(m => [Number(m[1]), Number(m[2])]);
  assert.ok(bars[1][0] > bars[0][0]);
  assert.ok(bars[2][0] > bars[1][0]);
  assert.ok(Math.abs(bars[0][0] + bars[0][1] - bars[1][0]) < 0.2);
  assert.ok(Math.abs(bars[1][0] + bars[1][1] - bars[2][0]) < 0.2);
});

test("repo chart groups main and worker worktrees by Run without merging different Runs", () => {
  C.state.data = { orca: { runs: [
    { id: "one", repo: "bisou", objective: "Tab cache" },
    { id: "two", repo: "bisou", objective: "Other work" },
  ] } };
  const row = (run_id, worktree, total) => ({ repo: "bisou", run_id, worktree, total, agent: "codex", calls: 1, end: 1 });
  const tree = repoTree([row("one", "(main)", 10), row("one", "tab-cache", 20), row("two", "tab-cache", 5), row(null, "(main)", 2)]);
  assert.equal(tree.length, 1);
  assert.equal(tree[0].a.t, 37);
  assert.equal(tree[0].wts.length, 3);
  const run = tree[0].wts.find(x => x.filter === "runF:one");
  assert.equal(run.wt, "Tab cache");
  assert.equal(run.a.t, 30);
});

test("timeline includes observed orchestrator activity and respects role filters", () => {
  C.state.data = { generated_at: 1000 };
  const r = { id: "orch", objective: "Work", created: 100, repo: "test", tasks: [], gates: [],
    orchestrator_activity: [{ agent: "codex", start: 90, end: 300, tokens: 10 }],
    orchestrator_by_agent: { codex: 10 } };
  C.gantt(runDetail(r), () => 0, "", "#orch-time");
  assert.match(element("#orch-time").innerHTML, /Orchestrator/);
  assert.match(element("#orch-time").innerHTML, /Codex/);
  C.gantt(runDetail(r), () => 0, "builder", "#orch-filter");
  assert.doesNotMatch(element("#orch-filter").innerHTML, /Orchestrator/);
  C.tokenTimeline(runDetail(r), () => 0, "builder", "#orch-tokens");
  assert.doesNotMatch(element("#orch-tokens").innerHTML, /Orchestrator/);
});


test("one run chart toggles units without changing task order", () => {
  C.state.agent = "";
  C.state.runMetric = "time";
  C.state.data = { generated_at: 1000 };
  const r = { id: "toggle", objective: "Toggle", created: 100, repo: "test", gates: [],
    tasks: [
      { id: "late", title: "Late task", measurement: { kind: "review", source: "metadata" }, created: 300, started: 300, completed: 500, status: "completed", tokens: { codex: 80 } },
      { id: "early", title: "Early task", measurement: { kind: "build", source: "metadata" }, created: 100, started: 100, completed: 200, status: "completed", tokens: { codex: 20 } },
    ], orchestrator_by_agent: { codex: 10 },
    events: [{ id: "peer", at: 400, kind: "peer", from: "Reviewer", to: "Builder", text: "Check <API>", body: "Reproduce & fix" }] };
  renderRunTimeline([runDetail(r)], r.id, "", "#toggle-host", "toggle-");
  assert.equal((element("#toggle-host").innerHTML.match(/<figure /g) || []).length, 2);
  assert.match(element("#toggle-host").innerHTML, /<figure class="chart"><h4[^>]*>Điều phối &amp; trao đổi/);
  assert.match(element("#toggle-host").innerHTML, /Run:<\/strong> Toggle/);
  assert.match(element("#toggle-host").innerHTML, /build × 1/);
  assert.match(element("#toggle-host").innerHTML, /review × 1/);
  assert.doesNotMatch(element("#toggle-host").innerHTML, /Các sự kiện trong toàn bộ run/);
  const time = element("#toggle-toggle").innerHTML;
  assert.ok(time.indexOf("Early task") < time.indexOf("Late task"));
  assert.match(time, /Thời gian/);
  assert.match(element("#toggle-host").innerHTML, /Reviewer → Builder/);
  assert.match(element("#toggle-host").innerHTML, /Check &lt;API&gt;/);

  element("#toggle-toggle-metric").listeners.click();
  const token = element("#toggle-toggle").innerHTML;
  assert.match(token, /Token/);
  assert.ok(token.indexOf("Early task") < token.indexOf("Late task"));
  assert.match(token, /Tổng: 110 token/);
  assert.match(token, /run-chart-toolbar"><h4>Toggle<\/h4><button/);
  assert.doesNotMatch(element("#toggle-host").innerHTML, /Tiến trình task/);
  element("#toggle-toggle-metric").listeners.click();
  assert.match(element("#toggle-toggle").innerHTML, /Thời gian/);
});

test("zero tokens have no filled bar and gates without tasks stay visible", () => {
  C.state.data = { generated_at: 1000 };
  const r = { id: "zero", objective: "Zero", created: 100, repo: "test", tasks: [
    { id: "zero", title: "No tokens", created: 200, status: "pending", tokens: {} },
  ], gates: [{ id: "g", created: 300, kind: "pending", question: "Approve?" }],
  events: [{ id: "g", at: 300, kind: "gate_question", from: "Orchestrator", to: "PO", text: "Approve?" }] };
  C.tokenTimeline(runDetail(r), () => 0, "", "#zero-token");
  assert.doesNotMatch(element("#zero-token").innerHTML, /<rect /);
  C.gantt(runDetail(r), () => 0, "", "#zero-time");
  assert.match(element("#zero-time").innerHTML, /Approve\?/);
});


test("short runs get several minute ticks", () => {
  const ticks = C.timeTicks(1794900780, 1794901380, 5);
  assert.ok(ticks.length >= 3);
  assert.ok(ticks.every(([at]) => at >= 1794900780 && at <= 1794901380));
});


test("peer inbox marks appear on participating tasks instead of the orchestrator lane", () => {
  C.state.data = { generated_at: 1000 };
  const r = { id: "peers", objective: "Peer work", created: 100, repo: "test", gates: [],
    tasks: ["build", "review"].map(id => ({ id, title: id, status: "completed", started: 100, completed: 300, tokens: {} })),
    events: [{ id: "mail", kind: "peer", at: 200, from: "Builder", to: "Reviewer", from_task: "build", to_task: "review", text: "API contract" }] };
  C.gantt(runDetail(r), () => 0, "", "#peer-chart");
  const html = element("#peer-chart").innerHTML;
  assert.equal((html.match(/aria-label="Worker ↔ worker/g) || []).length, 2);
  assert.match(html, /API contract/);
});


test("communication diagram orders arrows, keeps worker lanes stable and opens escaped details", () => {
  const r = { id: "mail", tasks: [
    { id: "build1", role: "builder" }, { id: "build2", role: "builder" }, { id: "review", role: "reviewer" },
  ], events: [
    { id: "later", at: 300, kind: "peer", from: "Build task 2", to: "Reviewer", from_task: "build2", to_task: "review", from_actor: "worker:a", to_actor: "worker:b", text: "Review <API>", body: "Details & evidence" },
    { id: "first", at: 100, kind: "dispatch", from: "Orchestrator", to: "Build task 1", to_task: "build1", from_actor: "coordinator", to_actor: "worker:a", text: "Giao việc" },
    { id: "self", at: 400, kind: "message", from: "Reviewer", to: "Reviewer", from_actor: "worker:b", to_actor: "worker:b", text: "Self note" },
  ] };
  const html = communicationDiagram(r, "mail-view");
  assert.match(html, /communication-diagram/);
  assert.equal((html.match(/class="participant"/g) || []).length, 3);
  assert.ok(html.indexOf('data-event="0"') < html.indexOf('data-event="1"'));
  assert.match(html, /marker-end=/);
  assert.doesNotMatch(html, /<ol>/);
  C.state.data = { generated_at: 1000 };
  r.tasks = []; r.gates = []; r.created = 100; r.objective = "Mail";
  renderRunTimeline([runDetail(r)], r.id, "", "#mail-host", "test-");
  element("#test-mail-events").listeners.click({ target: { closest() { return { dataset: { event: "1" } }; } } });
  assert.match(element("#detail-body").innerHTML, /Review &lt;API&gt;/);
  assert.match(element("#detail-body").innerHTML, /Details &amp; evidence/);
  assert.equal(element("#detail").open, true);
  assert.equal(element("#detail-title").textContent, "Chi tiết trao đổi");
  assert.doesNotMatch(html, /Chọn một mũi tên|event-detail/);
  let prevented = false;
  element("#test-mail-events").listeners.keydown({ type: "keydown", key: " ", preventDefault() { prevented = true; }, target: { closest() { return { dataset: { event: "0" } }; } } });
  assert.equal(prevented, true);
  assert.match(element("#detail-body").innerHTML, /Giao việc/);
});


test("run detail needs an explicit Run filter matching the filtered sessions", () => {
  Object.assign(C.state, { repo: "", wt: "", agent: "", role: "", runF: "", taskF: "" });
  const runs = ["a", "b"].map(id => ({ id, objective: id, created: 100, repo: "test", tasks: [], gates: [] }));
  C.state.data = { generated_at: 1000, orca: { runs } };
  const row = run_id => ({ run_id });
  renderOverall([row("a")]);
  assert.equal(element("#overall-timeline").hidden, true);
  C.state.repo = "test";
  renderOverall([row("a"), row("b")]);
  assert.equal(element("#overall-timeline").hidden, true);
  renderOverall([row("a")]);
  assert.equal(element("#overall-timeline").hidden, true);
  C.state.runF = "a";
  renderOverall([row("a")]);
  assert.equal(element("#overall-timeline").hidden, false);
  C.state.runF = "b";
  renderOverall([row("b")]);
  assert.equal(element("#overall-timeline").hidden, false);
  assert.match(element("#overall-run-list").innerHTML, /overall-g-b/);
  renderOverall([row("a")]);
  assert.equal(element("#overall-timeline").hidden, true);
  assert.equal(element("#overall-run-list").innerHTML, "");
});


test("role tier checks use Task routing rather than model-name guesses", () => {
  C.state.data = { roles_cfg: { tiers: {}, order: ["fast", "work", "top"], roles: { builder: { tier: "work" } } } };
  const row = (model, effort, routing) => ({ role: "builder", agent: "custom-agent", model, effort, routing, mix: {}, total: 10 });
  const routing = { agent: "custom-agent", model: "my-model", tier: "fast", effort: "medium" };
  const stats = roleStats([
    row("my-model", "high", routing), row("other-model", "high", routing),
    row("gpt-looks-expensive", "high", null),
  ])[0];
  assert.equal(stats.def.tier, "fast");
  assert.equal(stats.mismatch, 1);
  assert.equal(stats.effHi, 1);
  assert.equal(roleStats([row("gpt-looks-expensive", "high", null)])[0].mismatch, 0);
});

test("Tools legend toggles code-search chart categories", () => {
  C.state.searchHidden = [];
  C.state.data = { sessions: [] };
  const sessions = [
    { agent: "claude", role: "builder", repo: "r", worktree: "w1", total: 100, search: { codegraph: 3, rg: 1 } },
    { agent: "codex", role: "builder", repo: "r", worktree: "w2", total: 300, search: { rg: 4, read_full: 2 } },
  ];
  renderSearch(sessions);
  assert.match(element("#c-search-agent").innerHTML, /Codegraph/);
  assert.match(element("#c-search-agent").innerHTML, /Claude/);
  assert.match(element("#c-search-wt").innerHTML, /r\/w2/);
  assert.match(element("#c-search-agent").innerHTML, /data-toggle="search:rg"/);
  assert.match(element("#c-search-agent").innerHTML, /aria-pressed="true"/);

  assert.equal(toggleSearchKind("rg"), true);
  renderSearch(sessions);
  const html = element("#c-search-agent").innerHTML;
  assert.match(html, /data-toggle="search:rg"[^>]*aria-pressed="false"/);
  assert.doesNotMatch(html, /style="fill:var\(--blue\)"/);
  assert.equal(toggleSearchKind("not-a-kind"), false);
  C.state.searchHidden = [];
});

test("Codegraph percentage ignores file reads", () => {
  C.state.searchHidden = [];
  C.state.data = { sessions: [] };
  renderSearch([
    { agent: "claude", role: "builder", repo: "r", worktree: "w1", total: 100, search: { codegraph: 1, rg: 1, read_full: 8 } },
    { agent: "codex", role: "builder", repo: "r", worktree: "w2", total: 100, search: { read_part: 5 } },
  ]);
  const html = element("#c-search-agent").innerHTML;
  assert.match(html, /50% cg/);
  assert.doesNotMatch(html, /10% cg/);
  assert.doesNotMatch(html, /NaN|Infinity/);
});
