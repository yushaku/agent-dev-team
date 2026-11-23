"""Read-only inventory of executable files visible to the dashboard process."""

import json
import gzip
import os
import platform
import pwd
import re
import socket
import subprocess
import time
from collections import Counter
from email.parser import Parser
from pathlib import Path


def read_metadata(path):
    try:
        opener = gzip.open if path.suffix == ".gz" else open
        with opener(path, "rt", encoding="utf-8", errors="replace") as f:
            return f.read(65536)
    except (OSError, EOFError):
        return ""


def man_description(text):
    section = re.search(r'^\.(?:SH|Sh)\s+"?NAME"?\s*\n(.*?)(?=^\.(?:SH|Sh|SS|Ss)\s|\Z)', text, re.M | re.S)
    if not section:
        return ""
    body = section.group(1)
    nd = re.search(r"^\.Nd\s+(.+)", body, re.M)
    if nd:
        body = nd.group(1)
    else:
        body = " ".join(line for line in body.splitlines() if line and not line.startswith("."))
    body = re.sub(r'\\f(?:\[[^]]*\]|\(..|.)', '', body)
    body = body.replace(r"\-", "-").replace(r"\&", "").replace(r"\.", ".").replace(r"\e", "\\")
    if not nd:
        _, separator, body = body.partition(" - ")
        if not separator:
            return ""
    return " ".join(body.strip('"').split())[:500]


def homebrew_install_kind(path):
    parts = path.parts
    if "Cellar" in parts:
        root = Path(*parts[:parts.index("Cellar") + 3])
        receipt = root / "INSTALL_RECEIPT.json"
    elif "Caskroom" in parts:
        root = Path(*parts[:parts.index("Caskroom") + 2])
        receipt = root / ".metadata/INSTALL_RECEIPT.json"
    else:
        return "unknown"
    try:
        metadata = json.loads(read_metadata(receipt))
    except ValueError:
        return "unknown"
    if not isinstance(metadata, dict):
        return "unknown"
    if metadata.get("installed_on_request") is True:
        return "app"
    if metadata.get("installed_on_request") is False or metadata.get("installed_as_dependency") is True:
        return "dependency"
    return "unknown"


def tool_description(tool):
    path = Path(tool["resolved_path"])
    parts = path.parts
    roots = dict.fromkeys([path.parent.parent / "share/man", Path(tool["path"]).parent.parent / "share/man"])
    for root in roots:
        for section in ("1", "8", "6"):
            for suffix in ("", ".gz"):
                man = root / ("man" + section) / (tool["name"] + "." + section + suffix)
                description = man_description(read_metadata(man))
                if description:
                    return description, "man · " + tool["name"] + "(" + section + ")"
    if tool["source"] == "Homebrew" and "Cellar" in parts:
        root = Path(*parts[:parts.index("Cellar") + 3])
        formula = read_metadata(root / ".brew" / (tool["package"] + ".rb"))
        match = re.search(r'''^\s*desc\s+(["'])(.*?)\1\s*$''', formula, re.M)
        if match:
            return match.group(2).replace(r'\"', '"'), "Homebrew · " + tool["package"]
    if tool["source"] == "npm":
        i = len(parts) - 1 - parts[::-1].index("node_modules")
        root = Path(*parts[:i + 1 + len(tool["package"].split("/"))])
        try:
            metadata = json.loads(read_metadata(root / "package.json"))
            description = metadata.get("description") if isinstance(metadata, dict) else None
            if isinstance(description, str) and description.strip():
                return " ".join(description.split())[:500], "npm · " + tool["package"]
        except ValueError:
            pass
    if tool["source"] in ("uv", "pipx"):
        root = path.parent.parent
        for metadata_path in sorted(root.glob("lib/python*/site-packages/*.dist-info/METADATA")):
            metadata = Parser().parsestr(read_metadata(metadata_path), headersonly=True)
            installed_name = re.sub(r"[-_.]+", "-", metadata.get("Name", "")).lower()
            package_name = re.sub(r"[-_.]+", "-", tool["package"]).lower()
            if installed_name == package_name:
                summary = metadata.get("Summary", "").strip()
                if summary:
                    return " ".join(summary.split())[:500], tool["source"] + " · " + tool["package"]
    return "", ""


def machine_path():
    """LaunchAgents often inherit a smaller PATH than the user's terminal."""
    fallback = os.environ.get("PATH", "")
    shell = pwd.getpwuid(os.getuid()).pw_shell
    marker = "__TEAM_DASHBOARD_PATH__"
    try:
        result = subprocess.run([shell, "-ilc", 'printf "\\n' + marker + '%s\\n" "$PATH"'],
                                capture_output=True, text=True, timeout=5)
        for line in reversed(result.stdout.splitlines()):
            if line.startswith(marker):
                return line[len(marker):] + os.pathsep + fallback, []
    except (OSError, subprocess.TimeoutExpired, UnicodeError):
        pass
    return fallback, ["Không đọc được PATH của login shell; đang dùng PATH của dashboard."]


def installation(path):
    """Infer provenance from the resolved installation, never from command names."""
    parts = path.parts
    for marker in ("Cellar", "Caskroom"):
        if marker in parts:
            tail = parts[parts.index(marker) + 1:]
            if len(tail) >= 2:
                return "Homebrew", tail[0], tail[1]
    if "node_modules" in parts:
        i = len(parts) - 1 - parts[::-1].index("node_modules")
        tail = parts[i + 1:]
        count = 2 if tail and tail[0].startswith("@") else 1
        if len(tail) >= count:
            package = "/".join(tail[:count])
            try:
                with Path(*parts[:i + 1 + count]).joinpath("package.json").open() as f:
                    meta = json.loads(f.read(1024 * 1024))
                version = meta.get("version", "") if isinstance(meta, dict) else ""
            except (OSError, ValueError, IndexError):
                version = ""
            return "npm", package, version if isinstance(version, str) else ""
    for marker, source in (("uv", "uv"), ("pipx", "pipx")):
        if marker in parts:
            tail = parts[parts.index(marker) + 1:]
            if len(tail) >= 2 and tail[0] in ("tools", "venvs"):
                return source, tail[1], ""
    cargo = Path(os.environ.get("CARGO_HOME", str(Path.home() / ".cargo")))
    if path.parent == cargo / "bin":
        return "Cargo", "", ""
    system = any(path.is_relative_to(Path(root)) for root in
                 ("/usr", "/bin", "/sbin", "/System", "/Library/Apple"))
    if system and not path.is_relative_to(Path("/usr/local")):
        return "Hệ thống", "", ""
    if path.parent == Path.home() / "Library/pnpm/bin":
        return "pnpm", "", ""
    for root in (Path("/Applications"), Path.home() / ".local/share"):
        if path.is_relative_to(root):
            return str(root), "", ""
    return str(path.parent), "", ""


def discover(path_env=None):
    if path_env is None:
        path_env, warnings = machine_path()
    else:
        warnings = []
    paths = path_env.split(os.pathsep)
    directories, tools = [], {}
    for value in paths:
        directory = os.path.abspath(os.path.expanduser(value or "."))
        if directory in directories:
            continue
        directories.append(directory)
        try:
            with os.scandir(directory) as entries:
                for entry in entries:
                    try:
                        if not entry.is_file() or not os.access(entry.path, os.X_OK):
                            continue
                        resolved = Path(entry.path).resolve()
                        source, package, version = installation(resolved)
                        if source == "Hệ thống":
                            continue
                        item = dict(path=entry.path, resolved_path=str(resolved),
                                    source=source, package=package, version=version)
                        if entry.name in tools:
                            if item["path"] != tools[entry.name]["path"]:
                                tools[entry.name]["alternatives"].append(item)
                        else:
                            tools[entry.name] = dict(name=entry.name, alternatives=[], **item)
                    except (OSError, RuntimeError):
                        continue  # Broken or concurrently removed links are not commands.
        except FileNotFoundError:
            continue  # PATH commonly contains optional, uninstalled directories.
        except OSError:
            warnings.append("Không đọc được thư mục: " + directory)
    rows = sorted(tools.values(), key=lambda tool: tool["name"].casefold())
    for tool in rows:
        tool["install_kind"] = homebrew_install_kind(Path(tool["resolved_path"])) if tool["source"] == "Homebrew" else ""
        tool["description"], tool["description_source"] = tool_description(tool)
    return dict(machine=socket.gethostname(), system=platform.system(),
                generated_at=time.time(), directories=directories, warnings=warnings,
                sources=dict(sorted(Counter(tool["source"] for tool in rows).items())), tools=rows)
