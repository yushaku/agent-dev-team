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

    def test_search_kinds_classify_codegraph_and_text_search(self):
        from backend.parsers.common import search_kinds
        self.assertEqual(search_kinds("mcp__codegraph__codegraph_explore", {}), ["codegraph"])
        self.assertEqual(search_kinds("Bash", {"command": "codegraph callers build"}), ["codegraph"])
        self.assertEqual(search_kinds("Bash", {"command": "rtk rg -n foo src | head -5"}), ["rg", "read"])
        self.assertEqual(search_kinds("Bash", {"command": "git grep foo"}), ["grep"])
        self.assertEqual(search_kinds("Read", {"file_path": "/x"}), ["read"])
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


if __name__ == "__main__":
    unittest.main()
