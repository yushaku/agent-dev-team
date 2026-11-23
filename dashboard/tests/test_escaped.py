import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.escaped import default_head, repo_defects


class EscapedTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.repo = self.temp.name
        self.day = 1
        self.git("init", "-b", "main")
        self.git("config", "user.name", "Test")
        self.git("config", "user.email", "test@example.com")
        self.write("original\n")
        self.commit("initial")
        self.git("checkout", "-b", "feat/example")
        self.write("original\nbug\n")
        self.commit("feat: example")
        self.introducer = self.git("rev-parse", "HEAD")
        self.git("checkout", "main")
        self.commit_merge("feat/example")

    def git(self, *args):
        env = dict(os.environ, GIT_AUTHOR_DATE=f"2026-01-{self.day:02d}T12:00:00Z", GIT_COMMITTER_DATE=f"2026-01-{self.day:02d}T12:00:00Z")
        return subprocess.run(["git", "-C", self.repo, *args], check=True, capture_output=True, text=True, env=env).stdout.strip()

    def write(self, text, name="file.txt"):
        Path(self.repo, name).write_text(text)
        self.git("add", ".")

    def commit(self, message):
        self.git("commit", "--allow-empty", "-m", message)
        self.day += 1

    def commit_merge(self, branch):
        self.git("merge", "--no-ff", branch, "-m", f"Merge branch '{branch}'")
        self.day += 1

    def result(self):
        return repo_defects(self.repo, default_head(self.repo))

    def test_blame_add_only_trailer_whitespace_and_cache(self):
        self.write("original\ncorrect\n")
        self.commit("fix(parser): correct example")
        first = self.result()
        self.assertEqual(first["features"]["feat/example"]["escaped_defects"], 1)
        self.assertEqual(first["features"]["feat/example"]["median_days_to_surface"], 1)
        self.write("new\n", "added.txt")
        self.commit("fix: add missing file")
        self.write("original\n   correct\n")
        self.commit("fix: whitespace")
        self.commit("maintenance\n\nFixes-feature: example")
        result = self.result()
        feature = result["features"]["feat/example"]
        self.assertEqual(feature["escaped_defects"], 2)
        self.assertEqual([f["source"] for f in feature["fix_commits"]], ["szz", "trailer"])
        self.assertEqual({f["subject"] for f in result["unattributed_fix_commits"]}, {"fix: add missing file"})
        self.assertIs(result, self.result())

    def test_rename_and_pr_merge_deleted_branch(self):
        self.git("mv", "file.txt", "renamed file.txt")
        self.commit("refactor: rename")
        self.write("original\ncorrect\n", "renamed file.txt")
        self.commit("fix!: correct renamed file")
        self.git("branch", "-D", "feat/example")
        self.assertEqual(self.result()["features"]["feat/example"]["escaped_defects"], 1)
        from backend.escaped import merge_branch
        self.assertEqual(merge_branch("Merge pull request #12 from owner/feat/nested"), "feat/nested")

    def test_trailer_overrides_blame_and_window(self):
        self.git("checkout", "-b", "feat/other")
        self.write("other\n", "other.txt")
        self.commit("feat: other")
        self.git("checkout", "main")
        self.commit_merge("feat/other")
        self.write("original\ncorrect\n")
        self.commit("fix: override\n\nFixes-feature: feat/other")
        data = self.result()["features"]
        self.assertEqual(data["feat/example"]["escaped_defects"], 0)
        self.assertEqual(data["feat/other"]["escaped_defects"], 1)
        with patch("backend.escaped.ESCAPED_DEFECT_WINDOW_DAYS", 0):
            repo_defects.cache_clear()
            self.assertEqual(self.result()["features"]["feat/other"]["escaped_defects"], 0)
        repo_defects.cache_clear()

    def test_same_second_fix_uses_ancestry_order(self):
        self.day -= 1
        self.write("original\ncorrect\n")
        self.commit("fix: immediate correction")
        feature = self.result()["features"]["feat/example"]
        self.assertEqual(feature["escaped_defects"], 1)
        self.assertEqual(feature["median_days_to_surface"], 0)

    def test_fix_counts_when_merged_not_when_authored(self):
        self.git("checkout", "-b", "fix/later")
        self.write("original\ncorrect\n")
        self.commit("fix: delayed integration")
        self.git("checkout", "main")
        # The feature merged on January 3, so March 1 is outside the window.
        subprocess.run(["git", "-C", self.repo, "merge", "--no-ff", "fix/later", "-m", "Merge branch 'fix/later'"],
                       check=True, capture_output=True, env=dict(os.environ, GIT_AUTHOR_DATE="2026-03-01T12:00:00Z", GIT_COMMITTER_DATE="2026-03-01T12:00:00Z"))
        self.assertEqual(self.result()["features"]["feat/example"]["escaped_defects"], 0)
        self.assertEqual(self.result()["unattributed_fix_commits"], [])

    def test_git_failure_is_unknown(self):
        with patch("backend.escaped.git", return_value=None):
            self.assertIsNotNone(repo_defects("missing", "missing")["error"])
