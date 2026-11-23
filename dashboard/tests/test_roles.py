import unittest

from backend.parsers.common import finish_first
from backend.roles import assign_role, discussion_role, discussion_tool_role, known_roles, role_from_text, role_from_title


ROLES = {
    "builder", "reviewer", "tech-lead", "researcher",
    "solution-architect", "designer", "doc-keeper",
}


class RoleTests(unittest.TestCase):
    def test_active_role_count(self):
        roles = known_roles()
        self.assertEqual(len(roles), 11)
        self.assertTrue({"builder", "orchestrator"}.issubset(roles))

    def test_known_roles_span_workers_checks_and_sessions(self):
        roles = set(known_roles())
        self.assertTrue({"builder", "reviewer", "tech-lead", "designer", "support"}.issubset(roles))
        self.assertTrue({"security", "perf-a11y", "anti-ai"}.issubset(roles))
        self.assertTrue({"researcher", "solution-architect"}.issubset(roles))
        self.assertNotIn("investigator", roles)

    def test_investigator_maps_to_support(self):
        self.assertEqual(role_from_title("investigator: read the thread", ROLES), "support")
        self.assertEqual(role_from_title("support: read the thread", ROLES | {"support"}), "support")
        self.assertEqual(role_from_text("Role: roles/investigator.md", ROLES), "support")
        self.assertEqual(role_from_text("Role: roles/support.md", ROLES | {"support"}), "support")
        self.assertEqual(assign_role({"role": "investigator"}, {"role_line": None}), ("support", "orca"))

    def test_role_file_paths_in_any_group_dir(self):
        cases = (("roles/builder.md", "builder"), ("checks/security.md", "security"),
                 ("skills/researcher/SKILL.md", "researcher"))
        for path, want in cases:
            with self.subTest(path=path):
                self.assertEqual(role_from_text("Role: " + path, ROLES | {"security"}), want)

    def test_command_skill_loads_map_to_roles(self):
        for skill in ("researcher", "solution-architect"):
            with self.subTest(skill=skill):
                self.assertEqual(assign_role(None, {"role_line": None, "skills": [[skill, 1]]}), (skill, "skill"))
        self.assertEqual(assign_role({"role": "builder"}, {"role_line": None, "skills": [["researcher", 1]]}),
                         ("builder", "orca"))

    def test_discussion_reads_accept_roles_and_sessions_paths(self):
        for path in ("roles/researcher.md", "skills/researcher/SKILL.md"):
            with self.subTest(path=path):
                self.assertEqual(discussion_tool_role("Bash", {"command": "cat ~/.agents/teams/" + path}), "researcher")
                self.assertEqual(discussion_tool_role("Read", {"file_path": "/x/teams/" + path}), "researcher")
        self.assertIsNone(discussion_tool_role("Bash", {"command": "cat checks/security.md"}))

    def test_retired_roles_resolve_to_builder(self):
        for title in ("qa: acceptance tests", "QA", "qa-tests", "delivery: publish", "Delivery", "deliver"):
            with self.subTest(title=title):
                self.assertEqual(role_from_title(title, ROLES), "builder")
        self.assertEqual(role_from_text("Role: roles/qa.md", ROLES), "builder")
        self.assertEqual(role_from_text("Role: Delivery Engineer", ROLES), "builder")
        self.assertEqual(assign_role(None, {"role_line": "qa"}), ("builder", "role-line"))
        self.assertEqual(assign_role({"role": "delivery"}, {"role_line": None}), ("builder", "orca"))

    def test_orca_task_titles(self):
        self.assertEqual(role_from_title("builder: implement the change", ROLES), "builder")
        self.assertEqual(role_from_title("verify: check the result", ROLES), "reviewer")
        self.assertEqual(role_from_title("architect: map the system", ROLES), "tech-lead")
        self.assertEqual(role_from_title("pm-spec: write the spec", ROLES), "tech-lead")
        self.assertEqual(role_from_title("pm-tidy: tidy", ROLES), "tech-lead")
        self.assertEqual(role_from_title("PM: business spec", ROLES), "tech-lead")

    def test_role_line(self):
        self.assertEqual(role_from_text("Role: pm", ROLES), "tech-lead")
        self.assertEqual(role_from_text("Role: roles/pm.md", ROLES), "tech-lead")
        self.assertEqual(role_from_text("role: solution architecture", ROLES), "solution-architect")

    def test_discussion_role_phrasing(self):
        self.assertEqual(discussion_role("làm Researcher cho repo này"), "researcher")
        self.assertEqual(discussion_role("làm SA"), "solution-architect")

    def test_role_assignment_precedence_and_fallbacks(self):
        self.assertEqual(
            assign_role({"role": "builder"}, {"role_line": "tech-lead", "dispatcher": True}),
            ("builder", "orca"),
        )
        self.assertEqual(
            assign_role(None, {"role_line": None, "dispatcher": True}),
            ("orchestrator", "dispatch"),
        )
        self.assertEqual(
            assign_role(None, {"role_line": None}),
            ("chat trực tiếp", None),
        )
        self.assertEqual(
            assign_role({"role": None}, {"role_line": None}),
            ("worker", "orca"),
        )

    def test_hermes_subagent_has_no_discussion_role(self):
        session = {
            "first": "làm Researcher cho repo này",
            "subagent": False,
            "title": "Subagent: research task",
            "start": 1,
            "tasks": [],
        }
        finish_first(session)
        self.assertIsNone(session["discussion"])


if __name__ == "__main__":
    unittest.main()
