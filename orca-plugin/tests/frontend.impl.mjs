import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { SourceTextModule, SyntheticModule } from "node:vm";

const elements = new Map();
function element(id) {
  if (!elements.has(id)) elements.set(id, {
    id, style: {}, innerHTML: "", textContent: "", title: "", listeners: {},
    showModal() { this.open = true; }, close() { this.open = false; }, focus() {},
    setAttribute() {}, getAttribute() { return null; }, addEventListener(event, fn) { this.listeners[event] = fn; },
  });
  return elements.get(id);
}
globalThis.document = {
  querySelector: element,
  getElementById() { return null; },
  querySelectorAll: s => s === ".dash-view" ? ["tk-tong-quan", "tk-features", "tk-theo-repo", "tk-agents-tools", "tk-cli-tools", "tk-cach-tinh"].map(element) : [],
  addEventListener() {},
};
globalThis.window = { innerWidth: 1000, addEventListener() {} };
globalThis.localStorage = { getItem() { return null; }, setItem() {} };
globalThis.location = { hash: "" };
globalThis.history = { replaceState() {} };

const C = await import("../dashboard-web/js/lib/charts.js");
const { repoTree } = await import("../dashboard-web/js/tabs/repos.js");
const { renderRoles, roleStats } = await import("../dashboard-web/js/tabs/roles.js");
const { renderRoleSkills } = await import("../dashboard-web/js/tabs/role-skills.js");
const { runDetail, renderRunTimeline, communicationDiagram, renderFeatures, featureTimeline } = await import("../dashboard-web/js/tabs/runs.js");
const { renderOverall } = await import("../dashboard-web/js/tabs/overall.js");
const { renderCliTools, showCliTools } = await import("../dashboard-web/js/tabs/cli-tools.js");
const { renderTaskRoleSearch, renderSearch, toggleSearchKind, setSearchView } = await import("../dashboard-web/js/tabs/search.js");
const { renderSkills } = await import("../dashboard-web/js/tabs/skills.js");
const { renderRtkCommands } = await import("../dashboard-web/js/tabs/tokens.js");
const { trim } = await import("../src/trim.ts");

test("CLI inventory groups actual sources, filters and escapes machine filenames", () => {
  const data = { warnings: [], tools: [
    { name: "<new-tool>", description: 'Inspect <projects> & files', description_source: 'npm · "example"', source: "npm", package: "@local/example", version: "1.2", path: "/bin/<new-tool>", resolved_path: "/packages/<new-tool>", alternatives: [{ path: "/old/<new-tool>", source: "Homebrew" }] },
    { name: "another", source: "/custom/bin", package: "", version: "", path: "/custom/bin/another", resolved_path: "/custom/bin/another", alternatives: [] },
    { name: "hidden-brew", source: "/opt/homebrew/bin" },
    { name: "hidden-cloud", source: "/opt/homebrew/share/google-cloud-sdk/bin" },
  ] };
  renderCliTools(data);
  assert.equal(element("#cli-message").hidden, true);
  assert.match(element("#cli-list").innerHTML, /&lt;new-tool&gt;/);
  assert.doesNotMatch(element("#cli-list").innerHTML, /<new-tool>/);
  assert.match(element("#cli-list").innerHTML, /Inspect &lt;projects&gt; &amp; files/);
  assert.match(element("#cli-list").innerHTML, /title="npm · &quot;example&quot;"/);
  assert.doesNotMatch(element("#cli-list").innerHTML, /Chi tiết đường dẫn|cli-card-paths/);
  assert.match(element("#cli-list").innerHTML, /<article class="cli-card cli-package-card">/);
  assert.doesNotMatch(element("#cli-list").innerHTML, /<table/);
  assert.doesNotMatch(element("#cli-list").innerHTML, /hidden-brew|hidden-cloud/);
  renderCliTools(data, " EXAMPLE ", "npm");
  assert.match(element("#cli-list").innerHTML, /&lt;new-tool&gt;/);
  assert.doesNotMatch(element("#cli-list").innerHTML, /another/);
  renderCliTools(data, "inspect <projects>");
  assert.match(element("#cli-list").innerHTML, /&lt;new-tool&gt;/);
  assert.doesNotMatch(element("#cli-list").innerHTML, /another/);
  renderCliTools(data, "missing");
  assert.match(element("#cli-list").innerHTML, /Không tìm thấy/);
  renderCliTools(data, "", "/opt/homebrew/bin", true);
  assert.match(element("#cli-list").innerHTML, /Không tìm thấy/);
});

test("Homebrew hides only confirmed dependencies by default and labels each installation", () => {
  const tool = (name, source, install_kind) => ({ name, source, install_kind, package: name, version: "1", path: "/bin/" + name, resolved_path: "/bin/" + name, alternatives: [] });
  const inventory = { warnings: [], tools: [
    tool("requested-tool", "Homebrew", "app"),
    tool("automatic-library", "Homebrew", "dependency"),
    tool("legacy-tool", "Homebrew", "unknown"),
    tool("other-tool", "npm", "dependency"),
  ] };
  renderCliTools(inventory);
  let html = element("#cli-list").innerHTML;
  assert.match(html, /requested-tool/);
  assert.match(html, /Cài trực tiếp/);
  assert.match(html, /legacy-tool/);
  assert.match(html, /Chưa rõ cách cài/);
  assert.match(html, /other-tool/);
  assert.doesNotMatch(html, /automatic-library/);
  assert.doesNotMatch(html, /Gom theo package|cli-package-intro/);
  assert.match(html, /id="cli-homebrew"[^]*?<label class="cli-dependencies">/);
  renderCliTools(inventory, "", "Homebrew", true);
  html = element("#cli-list").innerHTML;
  assert.match(html, /automatic-library/);
  assert.match(html, /Dependency/);
  assert.doesNotMatch(html, /other-tool/);
  renderCliTools(inventory, "automatic-library", "Homebrew");
  assert.match(element("#cli-list").innerHTML, /Không tìm thấy/);
  assert.match(element("#cli-list").innerHTML, /id="cli-dependencies"/);
});

test("Homebrew groups package versions, keeps sibling commands in search and expands long command lists", () => {
  const tools = Array.from({ length: 8 }, (_, i) => ({
    name: `command-${i}`, source: "Homebrew", package: '<suite>', version: '2.0',
    install_kind: "app", path: `/bin/command-${i}`, description: i === 0 ? "Suite utilities" : "",
    description_source: "Homebrew · suite",
  }));
  tools.push({ ...tools[0], name: "old-command", version: "1.0" });
  const inventory = { warnings: [], tools };
  renderCliTools(inventory);
  let html = element("#cli-list").innerHTML;
  assert.equal((html.match(/class="cli-card cli-package-card"/g) || []).length, 2);
  assert.match(html, /\(2 package\)/);
  assert.match(html, /&lt;suite&gt;/);
  assert.doesNotMatch(html, /<suite>/);
  assert.match(html, /2 lệnh khác/);
  assert.match(html, /class="cli-package-more"><summary>/);
  renderCliTools(inventory, "command-7", "Homebrew");
  html = element("#cli-list").innerHTML;
  assert.equal((html.match(/class="cli-card cli-package-card"/g) || []).length, 1);
  assert.match(html, /command-0/);
  assert.match(html, /command-7/);
  assert.match(html, /class="cli-package-more" open/);
  assert.match(html, /Suite utilities/);
  assert.doesNotMatch(html, /old-command/);
});

test("all CLI sources share package cards without merging sources or unnamed commands", () => {
  const tool = (name, source, pkg = "shared-suite") => ({
    name, source, package: pkg, version: "1.0", path: `/bin/${name}`,
    description: `${source} description`, description_source: `${source} · metadata`,
  });
  const inventory = { warnings: [], tools: [
    tool("npm-main", "npm"), tool("npm-helper", "npm"),
    tool("uv-main", "uv"), tool("local-a", "/local/bin", ""), tool("local-b", "/local/bin", ""),
  ] };
  renderCliTools(inventory);
  let html = element("#cli-list").innerHTML;
  assert.equal((html.match(/class="cli-card cli-package-card"/g) || []).length, 4);
  assert.doesNotMatch(html, /Cài trực tiếp|Chưa rõ cách cài|Dependency/);
  assert.match(html, /2 mục/);
  renderCliTools(inventory, "npm-helper", "npm");
  html = element("#cli-list").innerHTML;
  assert.equal((html.match(/class="cli-card cli-package-card"/g) || []).length, 1);
  assert.match(html, /npm-main/);
  assert.match(html, /npm-helper/);
  assert.doesNotMatch(html, /uv-main|local-a|local-b/);
  assert.match(html, /npm description/);
});

test("CLI inventory loads independently, retries failures and rescans new commands", async () => {
  const originalFetch = globalThis.fetch;
  element("#cli-query").value = "";
  element("#cli-source").value = "";
  const data = { machine: "local", system: "Darwin", generated_at: 1, directories: ["/bin"], warnings: [], sources: {}, tools: [] };
  try {
    globalThis.fetch = async url => { assert.equal(url, "/api/cli-tools"); return { ok: false, status: 503 }; };
    await showCliTools();
    assert.equal(element("#cli-message").hidden, false);
    assert.match(element("#cli-message").textContent, /Không quét được.*503/);
    assert.equal(element("#cli-refresh").disabled, false);
    globalThis.fetch = async () => ({ ok: true, json: async () => data });
    await element("#cli-refresh").listeners.click();
    assert.equal(element("#cli-message").hidden, true);
    assert.match(element("#cli-list").innerHTML, /Không tìm thấy/);
    data.tools.push({ name: "brand-new", source: "custom", package: "", version: "", path: "/bin/brand-new", resolved_path: "/bin/brand-new", alternatives: [] });
    data.sources.custom = 1;
    data.sources["/opt/homebrew/bin"] = 1;
    data.sources["/opt/homebrew/share/google-cloud-sdk/bin"] = 5;
    element("#cli-source").value = "/opt/homebrew/bin";
    await element("#cli-refresh").listeners.click();
    assert.match(element("#cli-list").innerHTML, /brand-new/);
    assert.doesNotMatch(element("#cli-source").innerHTML, /\/opt\/homebrew/);
    assert.equal(element("#cli-source").value, "");
    data.tools.push({ name: "dependency-only", source: "Homebrew", package: "lib", install_kind: "dependency" });
    data.sources.Homebrew = 1;
    await element("#cli-refresh").listeners.click();
    assert.doesNotMatch(element("#cli-list").innerHTML, /dependency-only/);
    element("#cli-list").listeners.change({ target: { id: "cli-dependencies", checked: true } });
    assert.match(element("#cli-list").innerHTML, /dependency-only/);
    assert.match(element("#cli-list").innerHTML, /type="checkbox" checked/);
    element("#cli-list").listeners.change({ target: { id: "cli-dependencies", checked: false } });
    assert.doesNotMatch(element("#cli-list").innerHTML, /dependency-only/);
    globalThis.fetch = async () => { throw new Error("offline"); };
    await element("#cli-refresh").listeners.click();
    assert.match(element("#cli-message").textContent, /giữ kết quả lần quét trước/);
    assert.match(element("#cli-list").innerHTML, /brand-new/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

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
  assert.match(html, /class="role-skills"/);
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
  C.state.runF = "run_1";
  renderTaskRoleSearch(sessions);
  assert.equal(element("#task-search").hidden, false);
  C.state.runF = "";
});

test("Tasks role chart tooltip shows symbol rg lookups without drawing or counting them", () => {
  C.state.repo = "dashboard";
  renderTaskRoleSearch([{ role: "builder", search: { rg: 1, rg_symbol: 4 } }, { role: "reviewer", search: { rg: 2 } }]);
  const html = element("#c-task-search").innerHTML;
  assert.match(html, /rg\/grep tìm symbol: 4/);
  assert.equal((html.match(/rg\/grep tìm symbol/g) || []).length, 1);
  assert.doesNotMatch(html, /rg_symbol/);
  C.state.repo = "";
});

test("load distinguishes fetch failures from render failures and recovers", async () => {
  let renderError;
  const rendered = [];
  const dash = new SourceTextModule(await readFile(new URL("../dashboard-web/js/dash.js", import.meta.url), "utf8"));
  await dash.link(specifier => {
    const exports = specifier === "./lib/charts.js" ? C : {
      renderFeatures() { rendered.push("features"); }, renderOverall() { rendered.push("timeline"); }, renderOverview() { rendered.push("overview"); if (renderError) throw renderError; },
      renderRoles() { rendered.push("roles"); }, renderRoleSkills() { rendered.push("role-skills"); }, renderRepos() { rendered.push("repos"); }, renderSessionCharts() { rendered.push("sessions"); },
      showSession() {}, showCliTools() { rendered.push("cli-tools"); }, renderSkills() { rendered.push("skills"); }, renderRtkCommands() { rendered.push("rtk-commands"); }, renderSearch() { rendered.push("search"); }, renderTaskRoleSearch() { rendered.push("task-search"); }, toggleSearchKind() { return true; }, setSearchView() { return true; }, toggleSkills() {},
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
    assert.match(element("#auto").title, /missing chart binding/);
    assert.ok(logged.some(args => args.includes(renderError)));
    assert.equal(C.state.loading, false);

    renderError = null;
    rendered.length = 0;
    await load();
    assert.deepEqual(rendered, ["overview"]);
    assert.doesNotMatch(element("#updated").textContent, /Lỗi/);
    assert.doesNotMatch(element("#auto").title, /Lỗi/);
    assert.equal(C.state.err, "");
    assert.equal(element("#refresh").disabled, false);
    rendered.length = 0;
    dash.namespace.showView("tk-theo-repo", { hash: false });
    assert.deepEqual(rendered.sort(), ["repos", "role-skills", "roles", "sessions", "task-search", "timeline"]);
    rendered.length = 0;
    dash.namespace.showView("tk-agents-tools", { hash: false });
    assert.deepEqual(rendered, ["skills", "search", "rtk-commands"]);
    rendered.length = 0;
    dash.namespace.showView("tk-skills", { hash: false });
    assert.deepEqual(rendered, ["skills", "search", "rtk-commands"]);
    rendered.length = 0;
    dash.namespace.showView("tk-search", { hash: false });
    assert.deepEqual(rendered, ["skills", "search", "rtk-commands"]);
    rendered.length = 0;
    dash.namespace.showView("tk-cach-tinh", { hash: false });
    assert.deepEqual(rendered, []);
    dash.namespace.showView("tk-cli-tools", { hash: false });
    assert.deepEqual(rendered, ["cli-tools"]);
    assert.equal(element(".dash-head").hidden, true);
    dash.namespace.showView("tk-tong-quan", { hash: false });
    assert.equal(element(".dash-head").hidden, false);
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
  setSearchView("worktree"); renderSearch(sessions);
  assert.match(element("#c-search-agent").innerHTML, /r\/w2/);
  setSearchView("role"); renderSearch(sessions);
  assert.match(element("#c-search-agent").innerHTML, /builder/);
  setSearchView("agent"); renderSearch(sessions);
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

test("the Agents tools view renders the same from the worker's trimmed snapshot as from the full data", () => {
  const session = (agent, role, worktree, extra) => ({ id: agent + role, agent, role, repo: "r", worktree, total: 100, start: 100, skills: {}, hooks: {}, search: {},
    cwd: "/x", ctx: [1, 2], models: { m: 1 }, feature_segments: [{ tokens: 1 }], ...extra });
  const full = {
    sessions: [
      session("claude", "builder", "w1", { skills: { tdd: [3, 500], "code-review": [1, 400] }, search: { codegraph: 4, rg_symbol: 2, read_full: 9 } }),
      session("codex", "reviewer", "w2", { skills: { tdd: [1, 450] }, hooks: { ponytail: [100, "lite"] }, search: { rg: 5, find: 1 } }),
    ],
    skills_installed: ["tdd", "code-review", "unused-skill"],
    rtk: { available: true, by_cmd: [{ cmd: "git", n: 7, saved: 5000, pct: 70 }, { cmd: "rg", n: 3, saved: 900, pct: 40 }] },
    features: { repositories: {}, runs: [] }, orca: { runs: [] }, roles_cfg: { roles: {} },
  };
  const draw = (data) => {
    C.state.data = data; C.state.searchHidden = [];
    renderSkills(data.sessions); renderSearch(data.sessions); renderRtkCommands();
    return ["#c-skills", "#c-search-agent", "#c-rtk-cmd"].map((id) => element(id).innerHTML);
  };
  const fromFull = draw(full);
  const trimmed = trim(full, 600);
  assert.ok(trimmed.rtk && trimmed.skills_installed, "rtk and skills_installed survive the trim");
  const fromTrimmed = draw(JSON.parse(JSON.stringify(trimmed)));
  assert.deepEqual(fromTrimmed, fromFull);
  assert.match(fromTrimmed[0], /unused-skill/);
  assert.match(fromTrimmed[2], /git/);
  assert.ok(fromTrimmed.every((html) => html.length > 50 && !/NaN|undefined/.test(html)));
});

test("Codegraph percentage ignores file reads", () => {
  C.state.searchHidden = [];
  C.state.data = { sessions: [] };
  renderSearch([
    { agent: "claude", role: "builder", repo: "r", worktree: "w1", total: 100, search: { codegraph: 1, rg: 1, read_full: 8 } },
    { agent: "codex", role: "builder", repo: "r", worktree: "w2", total: 100, search: { read_part: 5 } },
  ]);
  const html = element("#c-search-agent").innerHTML;
  assert.match(html, /codegraph 50%/);
  assert.doesNotMatch(html, /codegraph 10%/);
  assert.doesNotMatch(html, /NaN|Infinity/);
});

test("Overview renders only summary metrics and charts", async () => {
  const { renderOverview } = await import("../dashboard-web/js/tabs/overview.js");
  C.state.data = { days: 7, dates: ["2026-11-25"], sessions: [] };
  renderOverview([]);
  assert.equal((element("#kpi").innerHTML.match(/class="card tile"/g) || []).length, 4);
  for (const id of ["#c-daily", "#c-parts", "#c-mix", "#c-top"]) {
    assert.match(element(id).innerHTML, /class="empty"/);
    assert.doesNotMatch(element(id).innerHTML, /<table|<figcaption/);
  }
});

test("feature Runs compare variants, preserve unknowns and escape branch and skill names", () => {
  C.state.repo = "";
  const feature = { repo: "sample", branch: "feat/<example>", variant: "direct", tokens: 100,
    first_activity: 10, last_activity: 20, lead_seconds: 10, session_count: 2, agents: ["codex"],
    loaded_skills: { "<skill>": 1 }, run_ids: [], fix_rounds: { count: 0, source: "code-review" },
    gate2_findings: null, delivered: null };
  C.state.data = { features: { runs: [feature, { ...feature, branch: "feat/orca", variant: "orca",
    tokens: 300, gate2_findings: 0, delivered: false, orchestrator_tokens: 50, worker_tokens: 250 }] } };
  const sessions = C.state.data.features.runs.map(f => ({ repo: f.repo, branch: f.branch }));
  renderFeatures(sessions);
  assert.match(element("#feature-tokens").innerHTML, /Trực tiếp/);
  assert.match(element("#feature-tokens").innerHTML, /Có Orca/);
  assert.match(element("#feature-findings").innerHTML, /Chưa rõ/);
  assert.match(element("#feature-findings").innerHTML, /Trực tiếp: 0\/1 Run có dữ liệu/);
  const html = element("#feature-runs").innerHTML;
  assert.match(html, /feat\/&lt;example&gt;/);
  assert.match(html, /&lt;skill&gt;/);
  assert.match(html, /Chưa merge/);
  assert.match(html, /Điều phối: 50/);
  assert.doesNotMatch(html, /<skill>|<example>|undefined|NaN/);
  renderFeatures([sessions[0]]);
  assert.doesNotMatch(element("#feature-runs").innerHTML, /feat\/orca/);
  renderFeatures([]);
  assert.match(element("#feature-runs").innerHTML, /Không có Run/);
  for (const id of ["tokens", "fixes", "findings", "distribution", "time"]) {
    assert.doesNotMatch(element("#feature-" + id).innerHTML, /<svg/);
    assert.match(element("#feature-" + id).innerHTML, /Không có dữ liệu/);
  }
});

test("feature charts preserve fractional medians, round buckets and delivery mark states", () => {
  C.state.repo = "";
  const rows = [0, 1, 2, 3, 7].map((count, i) => ({
    repo: "r", branch: "feat/<" + i + ">", variant: i < 2 ? "direct" : "orca", tokens: (i + 1) * 100,
    last_activity: 1795265470 + i * 86400, fix_rounds: { count, source: "reports" }, gate2_findings: i,
    delivered: [true, false, null, false, true][i], loaded_skills: {}, run_ids: [], agents: [], session_count: 1,
  }));
  C.state.data = { features: { runs: rows } };
  renderFeatures(rows);
  assert.match(element("#feature-fixes").innerHTML, />0\.5<\/text>/);
  assert.match(element("#feature-tokens").innerHTML, /Trực tiếp: 2 Run · Có Orca: 3 Run/);
  const distribution = element("#feature-distribution").innerHTML;
  assert.match(distribution, /3\+ vòng sửa/);
  assert.match(distribution, /Có Orca: 2 Run/);
  assert.equal((distribution.match(/<rect /g) || []).length, 4);
  const time = featureTimeline(rows, 500);
  assert.equal((time.match(/class="feature-point"/g) || []).length, 5);
  assert.equal((time.match(/tabindex="0"/g) || []).length, 5);
  assert.equal((time.match(/fill:var\(--mantle\)/g) || []).length, 3);
  assert.equal((time.match(/stroke-dasharray:2 2/g) || []).length, 1);
  assert.match(time, /feat\/&lt;0&gt;/);
  assert.match(time, /Vòng sửa: 7 · report Builder/);
  assert.match(time, /Lỗi Gate 2: 4/);
  assert.doesNotMatch(time, /NaN|undefined|Infinity/);
  assert.doesNotMatch(featureTimeline([{ ...rows[0], tokens: 0 }], 280), /NaN|Infinity/);
  renderFeatures([{ repo: "r", branch: "main", feature_segments: [rows[1]] }]);
  assert.match(element("#feature-runs").innerHTML, /feat\/&lt;1&gt;/);
  assert.doesNotMatch(element("#feature-runs").innerHTML, /feat\/&lt;2&gt;/);
  C.state.data.sessions = [{ repo: "original", feature_segments: [rows[1]] }];
  Object.assign(C.state, { repo: "r", agent: "", role: "", wt: "", runF: "", taskF: "" });
  assert.equal(C.sessionsF().length, 0);
  assert.equal(C.sessionsF(true).length, 1);
  renderFeatures(C.sessionsF(true));
  assert.match(element("#feature-runs").innerHTML, /feat\/&lt;1&gt;/);
  C.state.repo = "";
});

test("feature comparison waits for Orca's first load", () => {
  C.state.data = { features: { orca_loading: true, runs: [] } };
  renderFeatures([]);
  assert.match(element("#feature-tokens").innerHTML, /Đang tải dữ liệu Orca/);
  assert.doesNotMatch(element("#feature-tokens").innerHTML, /<svg/);
});

test("post-merge metrics say a repository's Git history is still being analysed", () => {
  C.state.repo = "";
  const run = { repo: "slow-repo", branch: "feat/x", variant: "direct", tokens: 10, fix_rounds: { count: 0, source: "reports" },
    loaded_skills: {}, run_ids: [], agents: [], session_count: 1, escaped_defects: null, median_days_to_surface: null, fix_commits: [] };
  const done = { ...run, repo: "ready-repo", branch: "feat/y", escaped_defects: 0 };
  C.state.data = { features: { runs: [run, done], repositories: { "slow-repo": { loading: true }, "ready-repo": { loading: false } } } };
  renderFeatures(C.state.data.features.runs);
  assert.match(element("#feature-escaped").innerHTML, /Đang phân tích Git \(slow-repo\)/);
  assert.doesNotMatch(element("#feature-escaped").innerHTML, /ready-repo\)/);
  assert.match(element("#feature-surface").innerHTML, /Đang phân tích Git \(slow-repo\)/);
  assert.match(element("#feature-runs").innerHTML, /Đang phân tích Git…/);
  assert.equal((element("#feature-runs").innerHTML.match(/Đang phân tích Git…/g) || []).length, 1, "only the repository still loading");
  C.state.data = { features: { runs: [run], repositories: { "slow-repo": { loading: false } } } };
  renderFeatures(C.state.data.features.runs);
  assert.doesNotMatch(element("#feature-escaped").innerHTML, /Đang phân tích Git/);
  assert.match(element("#feature-runs").innerHTML, /Chưa rõ/);
});

test("escaped defect charts preserve unknowns and escape fix subjects", () => {
  C.state.repo = "";
  const known = { repo: "r", branch: "feat/test", variant: "direct", tokens: 10,
    fix_rounds: { count: 0, source: "reports" }, loaded_skills: {}, run_ids: [], agents: [], session_count: 1,
    escaped_defects: 2, median_days_to_surface: 4, source: "szz",
    fix_commits: [{ sha: "abcdef", subject: "fix: <unsafe>", date: "2026-11-23", days_after_merge: 1, source: "szz" },
      { sha: "fedcba", subject: "fix: explicit", date: "2026-11-23", days_after_merge: 7, source: "trailer" }] };
  C.state.data = { features: { runs: [known, { ...known, variant: "orca", branch: "feat/unknown", escaped_defects: null, fix_commits: [] }] } };
  renderFeatures(C.state.data.features.runs);
  assert.match(element("#feature-escaped").innerHTML, /ước tính SZZ/);
  assert.match(element("#feature-escaped").innerHTML, /Có Orca: 0\/1 Run có dữ liệu/);
  assert.match(element("#feature-surface").innerHTML, /1 đến &lt;7 ngày/);
  assert.match(element("#feature-runs").innerHTML, /2 lỗi · 4 ngày/);
  assert.match(element("#feature-runs").innerHTML, /fix: &lt;unsafe&gt;/);
  assert.doesNotMatch(element("#feature-runs").innerHTML, /<unsafe>|NaN|undefined/);
});
