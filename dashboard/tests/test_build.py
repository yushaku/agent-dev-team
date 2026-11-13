import unittest

from backend.usage import build


class BuildTests(unittest.TestCase):
    def test_build_shape_and_session_attribution(self):
        data = build(30)
        self.assertEqual(
            set(data),
            {
                "generated_at", "days", "range_start", "dates", "sessions",
                "codex_limit", "copilot_dirs", "orca",
                "roles_cfg", "known_roles", "skills_installed", "prices",
                "unpriced_models", "rtk",
            },
        )
        for session in data["sessions"]:
            self.assertIn("role", session)
            self.assertIn("agent", session)


if __name__ == "__main__":
    unittest.main()
