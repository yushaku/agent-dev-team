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
        self.assertEqual(len(roles), 9)
        self.assertTrue({"builder", "orchestrator"}.issubset(roles))

    def test_retired_roles_still_resolve(self):
        roles = set(known_roles())
        self.assertEqual(role_from_title("tech-lead: spec", roles), "tech-lead")
        self.assertEqual(role_from_title("designer: options", roles), "designer")
        self.assertEqual(assign_role({"role": "designer"}, {"role_line": None}), ("designer", "orca"))

    def test_known_roles_span_workers_checks_and_sessions(self):
        roles = set(known_roles())
        self.assertTrue({"builder", "reviewer", "support-engineer"}.issubset(roles))
        self.assertNotIn("tech-lead", roles)
        self.assertNotIn("designer", roles)
        self.assertTrue({"security", "perf-a11y", "anti-ai"}.issubset(roles))
        self.assertTrue({"researcher", "solution-architect"}.issubset(roles))
        self.assertNotIn("investigator", roles)
        self.assertNotIn("support", roles)

    def test_investigator_and_support_map_to_support_engineer(self):
        for title in ("investigator: read the thread", "support: read the thread", "investigate: why", "support-engineer: x"):
            with self.subTest(title=title):
                self.assertEqual(role_from_title(title, ROLES | {"support-engineer"}), "support-engineer")
        self.assertEqual(role_from_text("Role: roles/investigator.md", ROLES), "support-engineer")
        self.assertEqual(role_from_text("Role: roles/support.md", ROLES), "support-engineer")
        self.assertEqual(role_from_text("Role: support-engineer", ROLES | {"support-engineer"}), "support-engineer")
        self.assertEqual(role_from_text("Role: skills/team-support-engineer/SKILL.md", ROLES), "support-engineer")
        self.assertEqual(assign_role({"role": "investigator"}, {"role_line": None}), ("support-engineer", "orca"))
        self.assertEqual(assign_role({"role": "support"}, {"role_line": None}), ("support-engineer", "orca"))

    def test_team_skill_load_gives_role_without_orca_role(self):
        self.assertEqual(assign_role(None, {"role_line": None, "skills": [["team-builder", 1]]}), ("builder", "skill"))
        self.assertEqual(assign_role({"role": None}, {"role_line": None, "skills": [["team-reviewer", 1]]}), ("reviewer", "skill"))
        self.assertEqual(assign_role({"role": "reviewer"}, {"role_line": None, "skills": [["team-builder", 1]]}), ("reviewer", "orca"))
        self.assertEqual(assign_role(None, {"role_line": None, "skills": [["team-support-engineer", 1]]}),
                         ("support-engineer", "skill"))
        self.assertEqual(assign_role(None, {"role_line": None, "skills": [["orchestrator", 1], ["team-builder", 1]]}),
                         ("orchestrator", "skill"))

    def test_role_file_paths_in_any_group_dir(self):
        cases = (("roles/builder.md", "builder"), ("checks/security.md", "security"),
                 ("skills/researcher/SKILL.md", "researcher"), ("skills/team-builder/SKILL.md", "builder"),
                 ("/x/skills/team-tech-lead/references/plan.md", "tech-lead"))
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
