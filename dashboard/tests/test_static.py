import json
import os
import re
import unittest

from backend import config, team_docs

WEB = os.path.join(config.HERE, "web")


class StaticTests(unittest.TestCase):
    def test_whitelist_files_exist(self):
        for path in config.STATIC:
            self.assertTrue(os.path.isfile(os.path.join(WEB, path.lstrip("/"))), path)

    def test_module_imports_are_whitelisted(self):
        for path in config.STATIC:
            if not path.endswith(".js") or "vendor" in path:
                continue
            with open(os.path.join(WEB, path.lstrip("/")), encoding="utf-8") as f:
                text = f.read()
            for spec in re.findall(r"from\s+\"(/js/[^\"]+)\"", text):
                self.assertIn(spec, config.STATIC, "%s imports %s" % (path, spec))

    def test_only_skill_endpoint_remains(self):
        for gone in ("index", "file", "diagram", "search"):
            self.assertIsNone(team_docs.handle("/api/team/" + gone, {}))
        status, _, _ = team_docs.handle("/api/team/skill", {"name": ["../etc"]})
        self.assertEqual(status, 400)
        status, body, _ = team_docs.handle("/api/team/skill", {"name": ["no-such-skill-xyz"]})
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["origin"], "missing")


if __name__ == "__main__":
    unittest.main()
