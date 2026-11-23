import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.features import build_features, delivered, feature_dir, gate_findings, report_rounds
from backend.insights import check_fix_rounds, run_summary, feature_scope
from backend.parsers.common import main_checkout, repo_of


class FeatureTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.repo = Path(self.temp.name) / "project"
        self.repo.mkdir()
        self.git("init", "-b", "main")
        self.commit("initial")
        main_checkout.cache_clear()

    def git(self, *args):
        return subprocess.run(["git", "-C", str(self.repo), *args], check=True, capture_output=True, text=True).stdout.strip()

    def commit(self, message):
        self.git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "--allow-empty", "-m", message)

    def row(self, branch="feat/example"):
        return dict(id="s", session_id="s", repo="project", cwd=str(self.repo), branch=branch,
                    agent="codex", start=10, end=30, total=100, skills={}, hooks={}, run_id=None, role="builder")

    def test_worktrees_group_by_repo_branch_and_skip_default(self):
        self.git("branch", "feat/example")
        wt = Path(self.temp.name) / "worker"
        self.git("worktree", "add", str(wt), "feat/example")
        self.assertEqual(repo_of(str(wt / "src"))[0], repo_of(str(self.repo))[0])
        a, b = self.row(), self.row()
        b.update(id="s:part:1", cwd=str(wt), run_id="run_one", total=50)
        run = dict(id="run_one", tasks=[], stage="unknown")
        data = build_features([a, b] + [self.row(x) for x in ("main", "master", "HEAD", "", None)], [run])
        feature = data["runs"][0]
        self.assertEqual(len(data["runs"]), 1)
        self.assertEqual(feature["variant"], "orca")
        self.assertEqual(feature["id"], '["project","feat/example"]')
        self.assertEqual(feature["sources"]["checkout"], "git")
        self.assertEqual(feature["sources"]["delivered"], "local_git_ancestry")
        self.assertIn("repo_basename_identity", feature["heuristics"])
        self.assertEqual(feature["run_ids"], ["run_one"])
        self.assertEqual(feature["tokens"], 150)
        self.assertEqual(feature["session_count"], 1)
        self.assertEqual(feature["lead_seconds"], 20)
        self.assertEqual(data["attribution"]["unassigned"], 500)
        self.assertEqual(run["stage"], "merged")
        self.assertTrue(run_summary(run)["delivered"])

    def test_sources_reports_skills_then_measurement(self):
        directory = feature_dir(str(self.repo), "feat/example")
        reports = directory / "reports"
        reports.mkdir(parents=True)
        for name in ("01-builder-r1.md", "02-builder-r2-fix.md", "03-builder-r3.md", "04-builder-r3-retry.md"):
            (reports / name).touch()
        self.assertEqual(report_rounds(directory), 3)
        row = self.row()
        row["skills"] = {"code-review": [6, 20]}
        row["hooks"] = {"ponytail": "full"}
        run = dict(id="r", repo="project", tasks=[dict(measurement=dict(kind="fix", round=1))])
        row["run_id"] = "r"
        feature = build_features([row], [run])["runs"][0]
        self.assertEqual(feature["fix_rounds"], dict(count=3, source="reports"))
        self.assertEqual(feature["loaded_skills"]["ponytail"], 1)
        self.assertEqual(run_summary(run)["fix_rounds"], 3)
        self.assertEqual(run_summary(run)["fix_rounds_source"], "reports")
        self.assertEqual(len(check_fix_rounds([run])), 1)
        for path in reports.iterdir():
            path.unlink()
        reports.rmdir()
        self.assertEqual(build_features([row], [run])["runs"][0]["fix_rounds"], dict(count=5, source="code-review"))
        row["skills"] = {}
        self.assertEqual(build_features([row], [run])["runs"][0]["fix_rounds"], dict(count=1, source="measurement"))
        row["run_id"] = None
        feature = build_features([row], [])["runs"][0]
        self.assertEqual(feature["variant"], "direct")
        self.assertEqual(feature["fix_rounds"], dict(count=0, source="code-review"))

    def test_gate_findings_unknown_zero_and_exact_lines(self):
        directory = feature_dir(str(self.repo), "fix/example")
        self.assertIsNone(gate_findings(directory))
        directory.mkdir(parents=True)
        path = directory / "decisions.md"
        path.write_text("No findings\n")
        self.assertIsNone(gate_findings(directory))
        path.write_text("- Gate 2: no findings\n")
        self.assertEqual(gate_findings(directory), 0)
        path.write_text("- Gate 2 finding: one\n - Gate 2 finding: ignored\n- Gate 2 finding: two\n")
        self.assertEqual(gate_findings(directory), 2)
        self.assertIsNone(gate_findings(None))

    def test_waits_for_orca_before_classifying(self):
        data = build_features([self.row()], [], orca_loaded=False)
        self.assertTrue(data["orca_loading"])
        self.assertIsNone(data["runs"][0]["variant"])
        self.assertEqual([c["count"] for c in data["comparison"]], [0, 0])

    def test_linked_run_tokens_include_other_branches_once(self):
        branch = self.row()
        branch.update(run_id="r", total=100)
        orch = self.row("main")
        orch.update(id="orch", run_id="r", role="orchestrator", total=6600000)
        worker = self.row("other")
        worker.update(id="worker", run_id="r", total=200)
        data = build_features([branch, orch, worker], [dict(id="r", tasks=[])])
        feature = next(f for f in data["runs"] if f["branch"] == branch["branch"])
        self.assertEqual(feature["tokens"], 6600300)
        self.assertEqual(feature["orchestrator_tokens"], 6600000)
        self.assertEqual(feature["worker_tokens"], 300)
        self.assertEqual(feature["sources"]["tokens"], "branch_segments_and_linked_run_ids")
        self.assertEqual(data["attribution"]["unassigned"], 0)

    def test_agent_feature_scope_preserves_metrics_and_repo_fixes(self):
        feature = dict(repo="project", branch="feat/example", run_ids=["r"], escaped_defects=2,
                       fix_commits=[dict(sha="abc", source="szz")], median_days_to_surface=1.5)
        data = dict(features=dict(runs=[feature], repositories={"project": dict(unattributed_fix_commits=["fix"]), "other": {}}))
        scope = feature_scope(data, run="r")
        self.assertEqual(scope["runs"], [feature])
        self.assertEqual(list(scope["repositories"]), ["project"])
        self.assertEqual(feature_scope(data, repo="other")["runs"], [])

    def test_delivery_merge_deleted_branch_and_cache_invalidation(self):
        self.git("checkout", "-b", "feat/example")
        self.commit("feature")
        self.assertFalse(delivered(str(self.repo), "feat/example"))
        self.git("checkout", "main")
        self.git("merge", "--ff-only", "feat/example")
        self.assertTrue(delivered(str(self.repo), "feat/example"))
        self.git("branch", "-d", "feat/example")
        self.assertIsNone(delivered(str(self.repo), "feat/example"))
        self.assertIsNone(delivered(None, "feature"))
        with patch("backend.features.subprocess.run", side_effect=subprocess.TimeoutExpired("git", 2)):
            self.assertIsNone(delivered(str(self.repo), "feature"))

    def test_default_branch_from_origin_head(self):
        self.git("branch", "trunk")
        self.git("symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/trunk")
        self.git("checkout", "-b", "feat/example")
        self.commit("feature")
        self.git("branch", "-f", "main", "feat/example")
        self.assertFalse(delivered(str(self.repo), "feat/example"))
