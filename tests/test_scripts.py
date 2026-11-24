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
            "T3CODE_HOME": str(self.work / ".t3"),
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

    def test_install_links_and_uninstalls_every_skill(self):
        skills = sorted(p.parent.name for p in (ROOT / "skills").glob("*/SKILL.md"))
        self.assertIn("bootstrap-repo", skills)
        self.assertIn("debug", skills)
        self.assertIn("ops", skills)
        self.assertIn("research", skills)
        self.assertIn("review", skills)
        self.assertIn("spark", skills)
        self.assertIn("sparring", skills)
        unrelated = self.work / ".claude/skills/custom-skill"
        unrelated.mkdir(parents=True)
        (unrelated / "SKILL.md").write_text("unrelated\n")

        skill_bases = (
            self.work / ".claude/skills",
            self.work / ".agents/skills",
            self.work / ".gemini/config/skills",
        )
        self.install()
        for base in skill_bases:
            for skill in skills:
                self.assertEqual((base / skill).readlink(), ROOT / "skills" / skill)

        self.install("--uninstall")
        for base in skill_bases:
            for skill in skills:
                self.assertFalse((base / skill).exists())
                self.assertFalse((base / skill).is_symlink())
        self.assertTrue((unrelated / "SKILL.md").is_file())

    def test_install_links_and_uninstalls_global_rules_for_all_harnesses(self):
        rule_links = (
            self.work / ".codex/AGENTS.md",
            self.work / ".claude/rules/sg303-global.md",
            self.work / ".config/opencode/AGENTS.md",
            self.work / ".gemini/config/AGENTS.md",
        )
        self.install()
        for link in rule_links:
            self.assertEqual(link.readlink(), ROOT / "global/AGENTS.md")

        self.install("--uninstall")
        for link in rule_links:
            self.assertFalse(link.exists())
            self.assertFalse(link.is_symlink())

    def test_install_preserves_conflicting_antigravity_rules(self):
        rules = self.work / ".gemini/config/AGENTS.md"
        rules.parent.mkdir(parents=True)
        rules.write_text("Existing Antigravity rules\n")
        self.install()
        self.assertEqual(rules.read_text(), "Existing Antigravity rules\n")
        self.install("--uninstall")
        self.assertEqual(rules.read_text(), "Existing Antigravity rules\n")

    def test_install_links_and_uninstalls_t3_antigravity_rules(self):
        provider_cfg = self.work / ".t3/userdata/providers/antigravity/inst1/config"
        provider_cfg.mkdir(parents=True)
        link = provider_cfg / "AGENTS.md"
        self.install()
        self.install()
        self.assertEqual(link.readlink(), ROOT / "global/AGENTS.md")
        self.install("--uninstall")
        self.install("--uninstall")
        self.assertFalse(link.exists())
        self.assertFalse(link.is_symlink())

    def test_install_preserves_conflicting_t3_antigravity_rules(self):
        rules = self.work / ".t3/userdata/providers/antigravity/inst1/config/AGENTS.md"
        rules.parent.mkdir(parents=True)
        rules.write_text("Existing T3 Antigravity rules\n")
        self.install()
        self.assertEqual(rules.read_text(), "Existing T3 Antigravity rules\n")
        self.install("--uninstall")
        self.assertEqual(rules.read_text(), "Existing T3 Antigravity rules\n")

    def test_install_skips_t3_antigravity_when_absent(self):
        self.install()
        self.assertFalse((self.work / ".t3").exists())

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
