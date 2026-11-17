import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { SourceTextModule, SyntheticModule } from "node:vm";

const elements = new Map();
function element(id) {
  if (!elements.has(id)) elements.set(id, {
    id, style: {}, innerHTML: "", textContent: "", title: "", listeners: {},
    setAttribute() {}, addEventListener(event, fn) { this.listeners[event] = fn; },
  });
  return elements.get(id);
}
globalThis.document = {
  querySelector: element,
  querySelectorAll: s => s === ".dash-view" ? ["tk-tong-quan", "tk-theo-repo", "tk-skills", "tk-rtk", "tk-cach-tinh"].map(element) : [],
  addEventListener() {},
};
globalThis.window = { innerWidth: 1000, addEventListener() {} };
globalThis.localStorage = { getItem() { return null; }, setItem() {} };
globalThis.location = { hash: "" };
globalThis.history = { replaceState() {} };

const C = await import("../web/js/lib/charts.js");
const { repoTree } = await import("../web/js/tabs/repos.js");
const { renderRoles } = await import("../web/js/tabs/roles.js");
const { runDetail } = await import("../web/js/tabs/runs.js");
const { renderOverall } = await import("../web/js/tabs/overall.js");

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

test("load distinguishes fetch failures from render failures and recovers", async () => {
  let renderError;
  const rendered = [];
  const dash = new SourceTextModule(await readFile(new URL("../web/js/dash.js", import.meta.url), "utf8"));
  await dash.link(specifier => {
    const exports = specifier === "./lib/charts.js" ? C : {
      renderOverall() { rendered.push("timeline"); }, renderOverview() { rendered.push("overview"); if (renderError) throw renderError; },
      renderRoles() { rendered.push("roles"); }, renderRepos() { rendered.push("repos"); }, renderSessionCharts() { rendered.push("sessions"); },
      showSession() {}, renderSkills() { rendered.push("skills"); }, renderTokens() { rendered.push("tokens"); },
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
    assert.deepEqual(rendered.sort(), ["repos", "roles", "sessions", "timeline"]);
    rendered.length = 0;
    dash.namespace.showView("tk-skills", { hash: false });
    assert.deepEqual(rendered, ["skills"]);
    rendered.length = 0;
    dash.namespace.showView("tk-rtk", { hash: false });
    assert.deepEqual(rendered, ["tokens"]);
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

test("token timeline chains bars to the run total", () => {
  C.state.data = { generated_at: 1000 };
  const tasks = [3, 5].map((v, n) => ({ id: String(n), title: "T" + n, role: "builder", status: "completed", created: 100 + n, started: 100 + n, completed: 200, tokens: { codex: v * 1e6 } }));
  const r = { id: "tk", objective: "Tok", created: 100, repo: "test", tasks, gates: [], tokens: {}, orchestrator_by_agent: { codex: 2e6 } };
  C.tokenTimeline(runDetail(r), t => t.tokens.codex || 0, "", "#tok");
  const html = element("#tok").innerHTML;
  assert.match(html, /Token theo thứ tự task/);
  assert.match(html, /Orchestrator/);
  assert.match(html, /Tổng: 10M token/);
  assert.equal((html.match(/<rect /g) || []).length, 3);
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
