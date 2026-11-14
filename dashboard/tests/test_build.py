import unittest
from unittest.mock import patch

from backend.usage import build


class BuildTests(unittest.TestCase):
    @patch("backend.usage.cache.load_files", return_value=[])
    @patch("backend.usage.hermes.parse_hermes", return_value=[])
    @patch("backend.usage.parse_rtk", return_value={"available": False})
    def test_build_shape_and_session_attribution(self, *_):
        data = build(30)
        self.assertEqual(
            set(data),
            {
                "generated_at", "days", "range_start", "dates", "sessions",
                "codex_limit", "copilot_dirs", "orca",
                "roles_cfg", "known_roles", "skills_installed",
                "rtk", "attribution",
            },
        )
        for session in data["sessions"]:
            self.assertIn("role", session)
            self.assertIn("agent", session)


if __name__ == "__main__":
    unittest.main()
