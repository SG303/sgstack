"""Regression tests for installation and dependency setup, without network access."""

import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]


class ScriptTests(unittest.TestCase):
    def setUp(self):
        scratch = Path.home() / ".t3" / "scratch"
        scratch.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(prefix="sgstack-tests-", dir=scratch)
        self.addCleanup(self.temp.cleanup)
        self.work = Path(self.temp.name)

    def install(self, *args):
        # Isolate the child process from the real harness configuration.
        env = os.environ | {
            "HOME": str(self.work),
            "CODEX_HOME": str(self.work / ".codex"),
            "XDG_CONFIG_HOME": str(self.work / ".config"),
        }
        subprocess.run(
            ["bash", str(ROOT / "scripts/install.sh"), *args],
            env=env, check=True, capture_output=True, text=True,
        )

    def test_install_migrates_owned_link_and_is_repeatable(self):
        legacy = self.work / ".claude/AGENTS.md"
        legacy.parent.mkdir()
        legacy.symlink_to(ROOT / "global/AGENTS.md")
        rules = self.work / ".claude/rules/sg303-global.md"
        self.install()
        self.install()
        self.assertEqual(rules.readlink(), ROOT / "global/AGENTS.md")
        self.assertFalse(legacy.is_symlink())
        self.install("--uninstall")
        self.install("--uninstall")
        self.assertFalse(rules.is_symlink())

    def test_install_preserves_conflicting_rules_and_legacy_link(self):
        rules = self.work / ".claude/rules/sg303-global.md"
        rules.parent.mkdir(parents=True)
        rules.write_text("Existing user rules\n")
        legacy = self.work / ".claude/AGENTS.md"
        legacy.symlink_to(ROOT / "global/AGENTS.md")
        self.install()
        self.assertEqual(rules.read_text(), "Existing user rules\n")
        self.assertTrue(legacy.is_symlink())
        self.install("--uninstall")
        self.assertEqual(rules.read_text(), "Existing user rules\n")
        self.assertFalse(legacy.is_symlink())

    def test_install_preserves_unrelated_legacy_link(self):
        legacy = self.work / ".claude/AGENTS.md"
        legacy.parent.mkdir()
        legacy.symlink_to(self.work / "other-rules.md")
        self.install()
        self.install("--uninstall")
        self.assertEqual(legacy.readlink(), self.work / "other-rules.md")

    def prepare_setup(self, installed):
        script = self.work / "setup.sh"
        shutil.copyfile(ROOT / "skills/ui-review/scripts/setup.sh", script)
        for filename in ("package.json", "package-lock.json"):
            file = self.work / filename
            file.write_text("{}\n")
            os.utime(file, (100, 100))
        if installed:
            for package in ("playwright", "@axe-core/playwright"):
                (self.work / "node_modules" / package).mkdir(parents=True)
            os.utime(self.work / "node_modules", (200, 200))
        bin_dir = self.work / "bin"
        bin_dir.mkdir()
        node = bin_dir / "node"
        node.write_text("#!/bin/sh\nprintf '[]\\n'\n")
        node.chmod(0o755)
        npm = bin_dir / "npm"
        npm.write_text(
            "#!/bin/sh\n"
            'printf "%s\\n" "$*" >> npm-calls.txt\n'
            "mkdir -p node_modules/playwright node_modules/@axe-core/playwright\n"
        )
        npm.chmod(0o755)
        return script, os.environ | {"PATH": str(bin_dir) + os.pathsep + os.environ["PATH"]}

    def run_setup(self, script, env):
        subprocess.run(
            ["bash", str(script)], env=env, check=True,
            capture_output=True, text=True,
        )

    def test_setup_reinstalls_after_lockfile_only_update(self):
        script, env = self.prepare_setup(installed=True)
        os.utime(self.work / "package-lock.json", (300, 300))
        self.run_setup(script, env)
        calls = self.work / "npm-calls.txt"
        self.assertTrue(calls.exists(), "Lockfile update must reinstall dependencies")
        self.assertEqual(calls.read_text(), "ci --no-audit --no-fund --silent\n")
        self.run_setup(script, env)
        self.assertEqual(len(calls.read_text().splitlines()), 1)

    def test_setup_skips_unchanged_installation(self):
        script, env = self.prepare_setup(installed=True)
        self.run_setup(script, env)
        self.assertFalse((self.work / "npm-calls.txt").exists())

    def test_setup_uses_lockfile_for_fresh_installation(self):
        script, env = self.prepare_setup(installed=False)
        self.run_setup(script, env)
        self.assertEqual(
            (self.work / "npm-calls.txt").read_text(),
            "ci --no-audit --no-fund --silent\n",
        )


if __name__ == "__main__":
    unittest.main()
