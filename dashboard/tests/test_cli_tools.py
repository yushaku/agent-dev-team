import json
import gzip
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.cli_tools import discover, installation, machine_path, man_description, tool_description, homebrew_install_kind


class CliToolsTests(unittest.TestCase):
    def test_homebrew_receipts_distinguish_requested_apps_dependencies_and_unknown(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            formula = root / "Cellar/example/1.0"
            formula.mkdir(parents=True)
            receipt = formula / "INSTALL_RECEIPT.json"
            command = formula / "bin/example"
            self.assertEqual(homebrew_install_kind(command), "unknown")
            cases = [
                ({"installed_on_request": True, "installed_as_dependency": True}, "app"),
                ({"installed_on_request": False}, "dependency"),
                ({"installed_as_dependency": True}, "dependency"),
                ({"installed_as_dependency": False}, "unknown"),
                ({"installed_on_request": "false"}, "unknown"),
                ({}, "unknown"),
                ([], "unknown"),
            ]
            for metadata, expected in cases:
                with self.subTest(metadata=metadata):
                    receipt.write_text(json.dumps(metadata))
                    self.assertEqual(homebrew_install_kind(command), expected)
            receipt.write_text("broken JSON")
            self.assertEqual(homebrew_install_kind(command), "unknown")
            cask = root / "Caskroom/example"
            receipt = cask / ".metadata/INSTALL_RECEIPT.json"
            receipt.parent.mkdir(parents=True)
            receipt.write_text(json.dumps({"installed_on_request": True}))
            self.assertEqual(homebrew_install_kind(cask / "1.0/bin/example"), "app")

    def test_description_prefers_command_manual_to_package_metadata(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "Cellar" / "extra-package" / "1.0"
            formula = root / ".brew" / "extra-package.rb"
            formula.parent.mkdir(parents=True)
            formula.write_text('  desc "Package purpose"\n')
            tool = dict(name="extra", source="Homebrew", package="extra-package",
                        path=str(root / "bin/extra"), resolved_path=str(root / "bin/extra"))
            self.assertEqual(tool_description(tool), ("Package purpose", "Homebrew · extra-package"))
            manual = root / "share/man/man1/extra.1.gz"
            manual.parent.mkdir(parents=True)
            with gzip.open(manual, "wt") as f:
                f.write('.SH NAME\nextra \\- inspect local files\n.SH SYNOPSIS\nnot a description\n')
            self.assertEqual(tool_description(tool), ("inspect local files", "man · extra(1)"))
            manual.write_bytes(b"broken gzip")
            self.assertEqual(tool_description(tool)[0], "Package purpose")

    def test_npm_and_python_descriptions_use_the_matching_installed_package(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            package = root / "node_modules/@vendor/extra"
            package.mkdir(parents=True)
            metadata = package / "package.json"
            metadata.write_text(json.dumps({"description": "Inspect local files"}))
            tool = dict(name="extra", source="npm", package="@vendor/extra",
                        path=str(package / "bin/extra"), resolved_path=str(package / "bin/extra"))
            self.assertEqual(tool_description(tool), ("Inspect local files", "npm · @vendor/extra"))
            metadata.write_text(json.dumps({"description": {"invalid": True}}))
            self.assertEqual(tool_description(tool), ("", ""))
            metadata.write_text("broken JSON")
            self.assertEqual(tool_description(tool), ("", ""))
            venv = root / "uv/tools/new-tool"
            site = venv / "lib/python3.12/site-packages"
            unrelated = site / "dependency.dist-info/METADATA"
            unrelated.parent.mkdir(parents=True)
            unrelated.write_text("Name: dependency\nSummary: Incorrect description\n")
            tool = dict(name="new", source="uv", package="new-tool", path=str(venv / "bin/new"), resolved_path=str(venv / "bin/new"))
            self.assertEqual(tool_description(tool), ("", ""))
            metadata = site / "new_tool.dist-info/METADATA"
            metadata.parent.mkdir()
            metadata.write_text("Name: New_Tool\nSummary: Check local projects\n")
            self.assertEqual(tool_description(tool), ("Check local projects", "uv · new-tool"))

    def test_manual_parser_handles_common_formats_without_reading_other_sections(self):
        self.assertEqual(man_description('.Sh NAME\n.Nm example\n.Nd inspect projects\n.Sh SYNOPSIS\nother'), "inspect projects")
        self.assertEqual(man_description('.SH "NAME"\nexample \\- inspect \\fBprojects\\fP\n.SH DESCRIPTION\nother'), "inspect projects")
        self.assertEqual(man_description('.SH "NAME"\nexample - inspect \\.files\n.SS Synopsis\nother'), "inspect .files")
        self.assertEqual(man_description('.SH DESCRIPTION\nnot a summary'), "")

    def test_live_inventory_follows_path_precedence_and_ignores_non_commands(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            first, second = root / "first", root / "second"
            first.mkdir()
            second.mkdir()
            installed = root / "Cellar" / "new-package" / "2.5" / "bin" / "new-command"
            installed.parent.mkdir(parents=True)
            installed.write_text("#!/bin/sh\ntouch " + str(root / "should-not-exist"))
            installed.chmod(0o755)
            (first / "new-command").symlink_to(installed)
            (second / "new-command").symlink_to(installed)
            (first / "broken").symlink_to(root / "missing")
            (first / "not-executable").write_text("data")
            (first / "directory").mkdir(mode=0o755)
            path = os.pathsep.join(map(str, [first, first, root / "absent", second]))
            data = discover(path)
            self.assertEqual(len(data["tools"]), 1)
            tool = data["tools"][0]
            self.assertEqual(tool["name"], "new-command")
            self.assertEqual(tool["path"], str(first / "new-command"))
            self.assertEqual(tool["source"], "Homebrew")
            self.assertEqual(tool["package"], "new-package")
            self.assertEqual(tool["version"], "2.5")
            self.assertEqual(tool["install_kind"], "unknown")
            self.assertEqual(tool["alternatives"][0]["path"], str(second / "new-command"))
            self.assertEqual(data["sources"], {"Homebrew": 1})
            self.assertEqual(len(data["directories"]), 3)
            self.assertFalse((root / "should-not-exist").exists())
            (first / "new-command").unlink()
            (second / "new-command").unlink()
            self.assertEqual(discover(path)["tools"], [])

    def test_provenance_uses_paths_and_local_package_metadata(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            package = root / "node_modules" / "@vendor" / "unknown-tool"
            package.mkdir(parents=True)
            (package / "package.json").write_text(json.dumps({"version": "3.1"}))
            command = package / "bin" / "run.js"
            self.assertEqual(installation(command), ("npm", "@vendor/unknown-tool", "3.1"))
            (package / "package.json").write_text("invalid JSON")
            self.assertEqual(installation(command), ("npm", "@vendor/unknown-tool", ""))
            self.assertEqual(installation(root / "uv/tools/new-tool/bin/run"), ("uv", "new-tool", ""))
            self.assertEqual(installation(root / "pipx/venvs/another/bin/run"), ("pipx", "another", ""))
            self.assertEqual(installation(root / "custom/run"), (str(root / "custom"), "", ""))
            with patch.dict(os.environ, {"CARGO_HOME": str(root / "rust")}):
                self.assertEqual(installation(root / "rust/bin/run"), ("Cargo", "", ""))

    def test_application_and_local_share_subdirectories_share_their_root_group(self):
        for path in ("/Applications/First.app/Contents/MacOS/tool", "/Applications/Second.app/Contents/Resources/bin/tool"):
            self.assertEqual(installation(Path(path))[0], "/Applications")
        self.assertNotEqual(installation(Path("/ApplicationsExtra/bin/tool"))[0], "/Applications")
        with patch("backend.cli_tools.Path.home", return_value=Path("/users/another-account")):
            self.assertEqual(installation(Path.home() / "Library/pnpm/bin/example")[0], "pnpm")
            root = Path.home() / ".local/share"
            for path in (root / "first/versions/1/bin/tool", root / "second/bin/tool"):
                self.assertEqual(installation(path)[0], str(root))
            self.assertEqual(installation(root / "uv/tools/example/bin/tool")[0], "uv")
            self.assertEqual(installation(root / "node_modules/example/bin/tool")[0], "npm")
            outside = Path.home() / ".local/share-extra/bin/tool"
            self.assertEqual(installation(outside)[0], str(outside.parent))

    def test_default_system_commands_are_excluded_without_hiding_installed_copies(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            system, downloaded = root / "system", root / "downloaded"
            system.mkdir()
            downloaded.mkdir()
            (system / "default-only").symlink_to("/bin/sh")
            (system / "extra-command").symlink_to("/bin/sh")
            executable = downloaded / "extra-command"
            executable.write_text("#!/bin/sh\nexit 0\n")
            executable.chmod(0o755)
            data = discover(os.pathsep.join(map(str, [system, downloaded])))
            self.assertEqual([t["name"] for t in data["tools"]], ["extra-command"])
            self.assertEqual(data["tools"][0]["path"], str(executable))
            self.assertEqual(data["tools"][0]["alternatives"], [])
            self.assertNotIn("Hệ thống", data["sources"])
        for path in ("/usr/bin/default", "/usr/libexec/default", "/System/Library/default", "/Library/Apple/usr/bin/default"):
            self.assertEqual(installation(Path(path))[0], "Hệ thống")
        self.assertNotEqual(installation(Path("/usr/local/bin/downloaded"))[0], "Hệ thống")

    @patch.dict(os.environ, {"PATH": "/server/bin"})
    @patch("backend.cli_tools.subprocess.run")
    def test_login_shell_path_and_timeout_fallback(self, run):
        run.return_value.stdout = "startup noise\n__TEAM_DASHBOARD_PATH__/user/bin:/usr/bin\n"
        self.assertEqual(machine_path(), ("/user/bin:/usr/bin:/server/bin", []))
        run.side_effect = subprocess.TimeoutExpired("shell", 5)
        path, warnings = machine_path()
        self.assertEqual(path, "/server/bin")
        self.assertTrue(warnings)

    def test_unreadable_directory_keeps_the_rest_of_the_inventory(self):
        with patch("backend.cli_tools.os.scandir", side_effect=PermissionError):
            data = discover("/unreadable")
        self.assertEqual(data["tools"], [])
        self.assertTrue(data["warnings"])
