import json
import os
import tempfile
import unittest
from unittest.mock import patch

from backend import insights as I


def sess(sid, role="builder", run="r1", total=100, **kw):
    s = dict(id=sid, session_id=sid, agent="codex", model="m1", effort="medium", role=role, run_id=run,
             task_id=None, repo="app", total=total, fin=0, cr=total // 2, cw=0, out=0, ctx_max=1000,
             skills={}, hooks={}, routing=None, mix={"m1|medium": total})
    s.update(kw)
    return s


def task(tid, kind="build", rnd=None, cause=None, role="builder", **kw):
    t = dict(id=tid, run="r1", title=role + ": x", role=role, status="completed", created=1000, completed=1100,
             measurement=dict(kind=kind, round=rnd, cause=cause, source="metadata"), routing=[], tokens={"codex": 10})
    t.update(kw)
    return t


def run(tasks=(), gates=(), **kw):
    r = dict(id="r1", objective="obj", repo="app", stage="delivered", tasks=list(tasks), gates=list(gates),
             lead_seconds=None, gate_wait_seconds=0, delivered_at=None, worker_tokens=5, orchestrator_tokens=1)
    r.update(kw)
    return r


def payload(sessions, runs):
    return {"days": 7, "generated_at": 1, "sessions": sessions, "orca": {"runs": runs}}


def issues(data, cards=None, **flt):
    return I.summary(data, cards={} if cards is None else cards, **flt)["issues"]


def ids_of(found, prefix):
    return [i for i in found if i["id"].startswith(prefix)]


class SymbolRgTests(unittest.TestCase):
    def test_threshold_per_run_and_role(self):
        a = sess("a", search={"rg_symbol": 2, "codegraph": 1})
        b = sess("b", search={"rg_symbol": 1, "rg": 4})
        found = ids_of(issues(payload([a, b], [run()])), "symbol-rg")
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0]["severity"], "medium")
        self.assertIn("3 lần", found[0]["evidence"])
        self.assertIn("codegraph 1", found[0]["evidence"])
        self.assertEqual(found[0]["filter"], {"run": "r1", "role": "builder", "repo": "app"})
        self.assertEqual(ids_of(issues(payload([a], [run()])), "symbol-rg"), [])
        other = sess("c", role="reviewer", search={"rg_symbol": 2})
        self.assertEqual(ids_of(issues(payload([a, other], [run()])), "symbol-rg"), [])  # roles do not pool

    def test_sessions_without_run_group_by_role_and_summary_table(self):
        X = [sess("s%d" % i, run=None, search={"rg": 1, "rg_symbol": 1}) for i in range(4)]
        d = I.summary(payload(X, []), cards={})
        found = ids_of(d["issues"], "symbol-rg")
        self.assertEqual(len(found), 1)
        self.assertIn("+1", found[0]["evidence"])
        self.assertEqual(d["search_by_role"][0]["rg_symbol"], 4)
        self.assertIn("## Code search by role", I.summary_md(d))


class CheckTests(unittest.TestCase):
    def test_top_tier_reviewer_on_rereview(self):
        t = task("t1", "re-review", role="reviewer")
        s = sess("s1", "reviewer", task_id="t1", routing=dict(tier="top", agent="codex", model="m1", effort="medium"))
        ok = sess("s2", "reviewer", task_id="t1", routing=dict(tier="work", agent="codex", model="m1", effort="medium"))
        found = ids_of(issues(payload([s, ok], [run([t])])), "top-rereview")
        self.assertEqual(len(found), 1)
        self.assertIn("s1", found[0]["evidence"])
        self.assertNotIn("s2", found[0]["evidence"])
        self.assertEqual(found[0]["filter"]["run"], "r1")
        full = task("t2", "review", role="reviewer")  # full review on top is allowed
        s3 = sess("s3", "reviewer", task_id="t2", routing=dict(tier="top", agent="codex", model="m1", effort="high"))
        self.assertEqual(ids_of(issues(payload([s3], [run([full])])), "top-rereview"), [])

    def test_top_model_without_routing_counts_as_top(self):
        t = task("t1", "re-review", role="reviewer")
        known = sess("a", "builder", model="big", routing=dict(tier="top", agent="codex", model="big", effort="high"))
        s = sess("s1", "reviewer", task_id="t1", model="big")
        self.assertEqual(len(ids_of(issues(payload([known, s], [run([t])])), "top-rereview")), 1)

    def test_required_skill_missing_per_run_and_role(self):
        cards = {"builder": {"required": ["tdd", "ponytail"], "conditional": ["diagnosing-bugs"]}}
        a = sess("a", skills={"tdd": [1, 5]})
        b = sess("b", hooks={"ponytail": 1})  # hook injection counts as loaded
        self.assertEqual(ids_of(issues(payload([a, b], [run()]), cards), "missing-skill"), [])
        found = ids_of(issues(payload([a], [run()]), cards), "missing-skill")
        self.assertEqual(len(found), 1)
        self.assertIn("ponytail", found[0]["evidence"])
        self.assertNotIn("diagnosing-bugs", found[0]["evidence"])
        self.assertEqual(found[0]["filter"], {"run": "r1", "role": "builder", "repo": "app"})

    def test_parse_role_skills_skips_placeholders_and_conditionals(self):
        with tempfile.TemporaryDirectory() as d:
            with open(os.path.join(d, "builder.md"), "w", encoding="utf-8") as f:
                f.write("- **Skills:** `tdd`, `ponytail`; `diagnosing-bugs` when fixing; `{build.ui}` for UI.\n")
            with open(os.path.join(d, "delivery.md"), "w", encoding="utf-8") as f:
                f.write("- **Skills:** load `ci` or `docs` only when the work touches that domain.\n")
            cards = I.parse_role_skills(d)
        self.assertEqual(cards["builder"], {"required": ["tdd", "ponytail"], "conditional": ["diagnosing-bugs"]})
        self.assertEqual(cards["delivery"]["required"], [])

    def test_real_role_cards_have_required_skills(self):
        cards = I.parse_role_skills()
        self.assertIn("ponytail-review", cards["reviewer"]["required"])
        self.assertNotIn("diagnosing-bugs", cards["builder"]["required"])

    def test_fix_rounds(self):
        fixes = [task("f%d" % i, "fix", i, "defect" if i < 3 else "scope") for i in (1, 2, 3)]
        fixes.append(task("f4", "fix", 3, "scope"))  # same round counts once
        found = ids_of(issues(payload([sess("x")], [run(fixes)])), "fix-rounds")
        self.assertEqual(len(found), 1)
        self.assertIn("3 vòng", found[0]["evidence"])
        self.assertIn("scope 2", found[0]["evidence"])
        two = [task("a", "fix", 1), task("b", "fix", 2)]
        self.assertEqual(ids_of(issues(payload([sess("x")], [run(two)])), "fix-rounds"), [])

    def test_session_outlier_needs_five_sessions(self):
        base = [sess("s%d" % i, total=100) for i in range(5)]
        big = sess("big", total=1500, ctx_max=777, cr=900)
        found = ids_of(issues(payload(base + [big], [])), "outlier")
        self.assertEqual(len(found), 1)
        self.assertIn("big", found[0]["evidence"])
        self.assertIn("ctx_max 777", found[0]["evidence"])
        self.assertIn("cache đọc 60%", found[0]["evidence"])
        self.assertEqual(found[0]["severity"], "high")
        self.assertEqual(ids_of(issues(payload(base[:3] + [big], [])), "outlier"), [])

    def test_routing_mismatch_and_higher_effort(self):
        r = dict(tier="work", agent="codex", model="m1", effort="medium")
        wrong = sess("w", model="m2", routing=r)
        high = sess("h", effort="high", routing=r)
        alias = sess("al", model="claude-opus-5", routing=dict(r, agent="codex", model="opus"))
        fine = sess("ok", routing=r)
        found = ids_of(issues(payload([wrong, high, alias, fine], [])), "routing")
        self.assertEqual(len(found), 1)
        text = found[0]["evidence"]
        self.assertIn("w)", text)
        self.assertEqual(found[0]["severity"], "medium")
        only_effort = ids_of(issues(payload([high, fine], [])), "routing")
        self.assertEqual(only_effort[0]["severity"], "low")
        self.assertEqual(ids_of(issues(payload([alias, fine], [])), "routing"), [])

    def test_gate_wait_dominates_lead_time(self):
        slow = run(lead_seconds=7200, gate_wait_seconds=5000, delivered_at=1)
        self.assertEqual(len(ids_of(issues(payload([sess("x")], [slow])), "gate-wait")), 1)
        self.assertEqual(ids_of(issues(payload([sess("x")], [run(lead_seconds=7200, gate_wait_seconds=3000)])), "gate-wait"), [])
        self.assertEqual(ids_of(issues(payload([sess("x")], [run(lead_seconds=None, gate_wait_seconds=5000)])), "gate-wait"), [])
        self.assertEqual(ids_of(issues(payload([sess("x")], [run(lead_seconds=100, gate_wait_seconds=90)])), "gate-wait"), [])

    def test_issues_sorted_by_severity(self):
        data = payload([sess("s%d" % i, total=100) for i in range(5)] + [sess("big", total=5000)],
                       [run(lead_seconds=7200, gate_wait_seconds=4000)])
        order = [i["severity"] for i in issues(data)]
        self.assertEqual(order, sorted(order, key=I.SEVERITY.get))


class ReportTests(unittest.TestCase):
    def setUp(self):
        self.data = payload(
            [sess("a", total=300, skills={"tdd": [2, 5]}, task_id="t1"), sess("b", "reviewer", total=100, run=None)],
            [run([task("t1")], gates=[dict(id="g1", kind="approve", stage="delivery", task="t1", created=100, resolved=400, question="ok?")])])

    def test_summary_aggregates_and_filters(self):
        s = I.summary(self.data, cards={})
        self.assertEqual(s["totals"]["tokens"], 400)
        self.assertEqual(s["tokens_by_role"][0]["role"], "builder")
        self.assertAlmostEqual(s["tokens_by_role"][0]["share"], 0.75)
        self.assertEqual(s["skills_by_role"]["builder"][0], {"skill": "tdd", "loads": 2, "sessions": 1})
        self.assertEqual(s["runs"][0]["id"], "r1")
        self.assertEqual(I.summary(self.data, role="reviewer", cards={})["totals"]["tokens"], 100)
        self.assertEqual(I.summary(self.data, repo="other", cards={})["totals"]["tokens"], 0)

    def test_markdown_is_compact_without_dashes(self):
        md = I.summary_md(I.summary(self.data, cards={}))
        for head in ("## Totals", "## Tokens by role", "## Skills by role", "## Runs", "## Issues"):
            self.assertIn(head, md)
        self.assertNotIn("\u2014", md)
        self.assertNotIn("\u2013", md)
        self.assertLess(len(md), 4000)

    def test_run_detail(self):
        d = I.run_detail(self.data, "r1", cards={})
        self.assertEqual(d["tasks"][0]["skills"], {"tdd": 2})
        self.assertEqual(d["gates"][0]["wait_seconds"], 300)
        self.assertIn("## Gates", I.run_md(d))
        self.assertIsNone(I.run_detail(self.data, "nope"))


class EndpointTests(unittest.TestCase):
    def setUp(self):
        self.body = json.dumps(payload([sess("a", total=300)], [run([task("t1")])])).encode()
        p = patch.object(I.snapshots.store, "get", return_value=self.body)
        p.start()
        self.addCleanup(p.stop)
        I._parsed.clear()

    def test_unknown_run_is_404(self):
        status, body, _ = I.handle("/api/agent/run", {"id": ["nope"]})
        self.assertEqual(status, 404)
        self.assertLess(len(body), 50)
        self.assertEqual(I.handle("/api/agent/run", {})[0], 404)

    def test_summary_markdown_and_json(self):
        status, body, ctype = I.handle("/api/agent/summary", {"days": ["7"]})
        self.assertEqual((status, ctype.split(";")[0]), (200, "text/markdown"))
        self.assertIn(b"## Tokens by role", body)
        status, body, ctype = I.handle("/api/agent/summary", {"format": ["json"]})
        self.assertEqual(ctype, "application/json")
        self.assertEqual(json.loads(body)["totals"]["tokens"], 300)
        status, body, _ = I.handle("/api/agent/run", {"id": ["r1"], "format": ["json"]})
        self.assertEqual(json.loads(body)["run"]["id"], "r1")

    def test_other_paths_fall_through(self):
        self.assertIsNone(I.handle("/api/data", {}))


if __name__ == "__main__":
    unittest.main()
