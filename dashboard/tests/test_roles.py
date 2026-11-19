import unittest

from backend.parsers.common import finish_first
from backend.roles import assign_role, discussion_role, known_roles, role_from_text, role_from_title


ROLES = {
    "builder", "reviewer", "tech-lead", "researcher",
    "solution-architect", "designer", "doc-keeper",
}


class RoleTests(unittest.TestCase):
    def test_active_role_count(self):
        roles = known_roles()
        self.assertEqual(len(roles), 12)
        self.assertTrue({"builder", "orchestrator"}.issubset(roles))

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
