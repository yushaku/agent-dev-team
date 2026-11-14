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
  querySelectorAll: s => s === ".dash-view" ? [element("tk-tong-quan")] : [],
  addEventListener() {},
};
globalThis.window = { innerWidth: 1000, addEventListener() {} };
globalThis.localStorage = { getItem() { return null; }, setItem() {} };
globalThis.location = { hash: "" };
globalThis.history = { replaceState() {} };

const C = await import("../web/js/lib/charts.js");
const { renderRoles } = await import("../web/js/tabs/roles.js");
const { runDetail } = await import("../web/js/tabs/runs.js");
const live = await import("../web/js/tabs/live.js");
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
  assert.match(element("#t-roles").innerHTML, /builder/);
});

test("load distinguishes fetch failures from render failures and recovers", async () => {
  let renderError;
  const dash = new SourceTextModule(await readFile(new URL("../web/js/dash.js", import.meta.url), "utf8"));
  await dash.link(specifier => {
    const exports = specifier === "./lib/charts.js" ? C : {
      renderOverall() {}, renderOverview() { if (renderError) throw renderError; },
      renderRoles() {}, renderRepos() {}, renderLive() {}, renderSessions() {},
      showSession() {}, renderSkills() {}, renderTokens() {}, renderOverall() {},
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
    await load();
    assert.doesNotMatch(element("#updated").textContent, /Lỗi/);
    assert.equal(element("#updated").title, "");
    assert.equal(C.state.err, "");
    assert.equal(element("#refresh").disabled, false);
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

test("overview shows unassigned tokens next to the Run data", () => {
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
  assert.match(element("#overall-kpi").innerHTML, /10 token chưa phân bổ/);
  assert.doesNotMatch(element("#overall-kpi").innerHTML, /USD|\$|Chi phí/);
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

const W = (key, status, extra = {}) => ({ dispatch_id: key, task_id: "t_" + key, status, agent: "codex", dispatched_at: 100, ...extra });
const LR = (id, workers, extra = {}) => ({ id, repo: "bisou", objective: "o", created: 1, tasks: [], workers, gates: [], events: [], ...extra });

test("live: global filters keep Runs by repo, run and agent", () => {
  const runs = [LR("a", [W("1", "working"), W("2", "idle", { agent: "claude" })], { orchestrator: { agent: "hermes" } }),
    LR("b", [W("3", "idle")], { repo: "monmon" })];
  assert.deepEqual(live.filterRuns(runs, {}).map(r => r.id), ["a", "b"]);
  assert.deepEqual(live.filterRuns(runs, { repo: "monmon" }).map(r => r.id), ["b"]);
  assert.deepEqual(live.filterRuns(runs, { runF: "a" }).map(r => r.id), ["a"]);
  const claude = live.filterRuns(runs, { agent: "claude" });
  assert.deepEqual(claude.map(r => r.id), ["a"]);
  assert.deepEqual(claude[0].workers.map(w => w.dispatch_id), ["2"]);
  assert.deepEqual(live.filterRuns(runs, { agent: "hermes" }).map(r => r.id), ["a"]);  // orchestrates Run a
});

test("live: snapshot diff turns changes into spawn, report, release and new events", () => {
  const ev = (id, type, t) => ({ id, type, t, run: "a", text: id });
  const prev = { runs: [LR("a", [W("1", "working"), W("2", "idle")], { events: [ev("e1", "dispatch", 1)] })] };
  const next = { runs: [LR("a", [W("1", "idle"), W("2", "released"), W("3", "working")], { events: [ev("e1", "dispatch", 1), ev("e3", "release", 3), ev("e2", "done", 2)] }),
    LR("b", [W("9", "working")])] };
  const d = live.diffSnapshots(prev, next);
  assert.deepEqual(d.spawned.map(s => s.run + ":" + s.key), ["a:3", "b:9"]);
  assert.deepEqual(d.reported.map(s => s.key), ["1"]);
  assert.deepEqual(d.released.map(s => s.key), ["2"]);
  assert.deepEqual(d.events.map(e => e.id), ["e2", "e3"]);
  assert.deepEqual(d.newRuns, ["b"]);
  const first = live.diffSnapshots(null, next);
  assert.deepEqual([first.spawned, first.events, first.reported], [[], [], []]);  // first load replays nothing
  assert.deepEqual(live.diffSnapshots(next, next).spawned, []);
});

test("live: counts, orbit layout and log order", () => {
  const r = LR("a", [W("1", "working"), W("2", "idle"), W("3", "released"), W("4", "released")], {
    tasks: [{ id: "t_1", status: "dispatched" }, { id: "t_x", status: "ready" }, { id: "t_y", status: "completed" }],
    gates: [{ id: "g", status: "pending" }, { id: "h", status: "resolved" }], tokens: 1500 });
  assert.deepEqual(live.countsOf([r]), { orch: 1, work: 1, wait: 1, gate: 1, idle: 1, released: 2, tokens: 1500 });
  const many = LR("m", Array.from({ length: 20 }, (_, i) => W("w" + i, i < 3 ? "working" : "released", { released_at: i })));
  const { shown, hidden } = live.visibleWorkers(many, 14);
  assert.equal(shown.length, 14);
  assert.equal(hidden, 6);
  assert.ok(shown.slice(0, 3).every(w => w.status === "working") || shown.filter(w => w.status === "working").length === 3);
  const cells = live.layoutCells(2, 640, 620);
  assert.deepEqual(cells.map(c => Math.round(c.cx)), [320, 320]);
  assert.equal(cells[1].cy - cells[0].cy, 620);
  assert.ok(cells[0].capY < -100 && cells[0].R > 100);
  const top = live.satPos(0, 4, 100);
  assert.ok(Math.abs(top.x) > 1);  // never straight above the hub, where the PO gate card sits
  assert.deepEqual(live.mergedEvents([LR("a", [], { events: [{ id: "x", t: 1 }, { id: "y", t: 3 }] }), LR("b", [], { events: [{ id: "z", t: 2 }] })], 2).map(e => e.id), ["y", "z"]);
});

test("live: copy never uses em or en dashes", async () => {
  const src = await readFile(new URL("../web/js/tabs/live.js", import.meta.url), "utf8");
  assert.doesNotMatch(src, /[\u2013\u2014]/);
  assert.equal(live.fmtDur(75), "1 phút 15 giây");
  assert.deepEqual([60, 400, 700, 1000, 4000].map(live.windowFor), [300, 600, 900, 1800, 1800]);
  assert.equal(live.tickStep(300), 60);
});
