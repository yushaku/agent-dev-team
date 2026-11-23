import json
import os
import tempfile
import unittest

from backend.parsers.claude import parse_claude
from backend.parsers.codex import parse_codex
from backend.parsers.common import note_orca


class ParserTests(unittest.TestCase):
    def test_run_bindings_come_from_commands_and_keep_reentry(self):
        s = {}
        note_orca(s, 'echo "orca orchestration task-create --run run_fake"', 1)
        note_orca(s, 'orca orchestration worker-start --run run_fake --help', 2)
        self.assertNotIn("runs", s)
        note_orca(s, 'rtk proxy orca orchestration run-use --id run_a --from term_a', 3)
        note_orca(s, 'echo done; orca orchestration task-create --run=run_b', 4)
        note_orca(s, 'orca orchestration worker-start --run run_a', 5)
        self.assertEqual(s["runs"], [["run_a", 3], ["run_b", 4], ["run_a", 5]])

    def test_rg_symbol_needs_symbol_pattern_and_codegraph_index(self):
        import os, tempfile
        from backend.parsers import common
        from backend.parsers.common import search_kinds
        if common.CG_NUDGE is None:
            self.skipTest("cg_nudge not importable")
        with tempfile.TemporaryDirectory() as d:
            indexed, plain = os.path.join(d, "a"), os.path.join(d, "b")
            os.makedirs(os.path.join(indexed, ".codegraph"))
            os.makedirs(plain)
            sym, lit = {"command": "rg -n 'parseCartHeaderDiscount' src"}, {"command": "rg -n 'no results found' src"}
            self.assertEqual(search_kinds("Bash", sym, indexed), ["rg", "rg_symbol"])
            self.assertEqual(search_kinds("Bash", {"command": "grep -rn parse_cart_header ."}, indexed), ["grep", "rg_symbol"])
            self.assertEqual(search_kinds("Bash", lit, indexed), ["rg"])
            self.assertEqual(search_kinds("Bash", sym, plain), ["rg"])
            self.assertEqual(search_kinds("Bash", sym), ["rg"])
            self.assertEqual(search_kinds("Bash", {"command": "cat src/a.py"}, indexed), ["read_full"])
            s = {}
            common.note_search(s, "Bash", sym, 5, indexed)
            self.assertEqual([k for k, _ in s["search"]], ["rg", "rg_symbol"])

    def test_search_kinds_classify_codegraph_and_text_search(self):
        from backend.parsers.common import search_kinds
        self.assertEqual(search_kinds("mcp__codegraph__codegraph_explore", {}), ["codegraph"])
        self.assertEqual(search_kinds("Bash", {"command": "codegraph callers build"}), ["codegraph"])
        self.assertEqual(search_kinds("Bash", {"command": "rtk rg -n foo src | head -5"}), ["rg"])
        self.assertEqual(search_kinds("Bash", {"command": "cat src/a.py"}), ["read_full"])
        self.assertEqual(search_kinds("Bash", {"command": "sed -n 1,40p src/a.py"}), ["read_part"])
        self.assertEqual(search_kinds("Read", {"file_path": "/x", "limit": 40}), ["read_part"])
        self.assertEqual(search_kinds("read", '{"file_path": "/x", "start_line": 5}'), ["read_part"])
        self.assertEqual(search_kinds("Bash", {"command": "git grep foo"}), ["grep"])
        self.assertEqual(search_kinds("Read", {"file_path": "/x"}), ["read_full"])
        self.assertEqual(search_kinds("exec", 'await tools.exec_command({cmd: "rg foo"})'), ["rg"])
        self.assertEqual(search_kinds("Bash", {"command": "codegraph init"}), [])
        self.assertEqual(search_kinds("Bash", {"command": "npm test"}), [])

    def parse(self, parser, events):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "session.jsonl")
            with open(path, "w") as f:
                for event in events:
                    f.write(json.dumps(event, separators=(",", ":")) + "\n")
            return parser(path)

    def test_codex_exec_and_reused_worker_task_ids(self):
        events = [dict(type="session_meta", payload=dict(id="s", cwd="/repo"))]
        for i, tid in enumerate(("task_aaa", "task_bbb", "task_aaa")):
            events.append(dict(type="response_item", timestamp=f"2026-11-13T00:00:0{i}Z",
                               payload=dict(type="message", role="user", content=[dict(text="Your task ID is: " + tid)])))
        events.append(dict(type="response_item", timestamp="2026-11-13T00:00:04Z", payload=dict(
            type="function_call", name="exec", arguments='await tools.exec_command({cmd: "orca orchestration task-create --run run_aaa"})')))
        result = self.parse(parse_codex, events)
        self.assertEqual([x[0] for x in result["tasks"]], ["task_aaa", "task_bbb", "task_aaa"])
        self.assertEqual(result["runs"][0][0], "run_aaa")

    def test_claude_bash_binding(self):
        result = self.parse(parse_claude, [dict(type="assistant", timestamp="2026-11-13T00:00:01Z",
            message=dict(content=[dict(type="tool_use", name="Bash", input=dict(command="orca orchestration run-use --id run_aaa"))]))])
        self.assertEqual(result["runs"][0][0], "run_aaa")

    def test_codex_token_count_context_survives_missing_branch_metadata(self):
        events = [dict(type="session_meta", payload=dict(id="s", cwd="/repo/main", git=dict(branch="main")))]
        for i, branch in enumerate(("main", "feat/new", None)):
            events.append(dict(type="turn_context", timestamp=f"2026-11-13T00:00:0{i}Z",
                               payload=dict(cwd="/repo/main", git=dict(branch=branch))))
            events.append(dict(type="event_msg", timestamp=f"2026-11-13T00:00:0{i}Z", payload=dict(
                type="token_count", info=dict(total_token_usage=dict(total_tokens=i + 1),
                                             last_token_usage=dict(input_tokens=10)))))
        result = self.parse(parse_codex, events)
        self.assertEqual([c[10]["branch"] for c in result["calls"]], ["main", "feat/new", "feat/new"])
        self.assertEqual(result["branch"], "main")

    def test_codex_session_branch_provenance_and_unknown_repo_switch(self):
        events = [dict(type="session_meta", payload=dict(id="s", cwd="/repo/main", git=dict(branch="feat/one")))]
        for cwd in ("/repo/main", "/other/main"):
            events += [dict(type="turn_context", payload=dict(cwd=cwd)),
                       dict(type="token_usage_record", payload=dict(usage=dict(input_tokens=10)))]
        result = self.parse(parse_codex, events)
        self.assertEqual(result["calls"][0][10]["branch_source"], "session")
        self.assertIsNone(result["calls"][1][10]["branch"])
        self.assertEqual((result["cwd"], result["branch"]), ("/repo/main", "feat/one"))


if __name__ == "__main__":
    unittest.main()
