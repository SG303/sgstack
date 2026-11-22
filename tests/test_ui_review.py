"""Regression tests for ui-review gates, prompts, probes and reporting (no LLM/network calls)."""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import struct
import subprocess
import tempfile
import threading
import unittest
import zlib


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "skills/ui-review/scripts"
NODE_MODULES = SCRIPTS / "node_modules"


def make_png(path: Path, width: int, height: int, rgba=(240, 240, 240, 255)) -> None:
    """Write a minimal valid solid-color RGBA PNG using only stdlib."""
    def chunk(tag: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)

    row = b"\x00" + bytes(rgba) * width
    raw = zlib.compress(row * height, level=1)
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", raw) + chunk(b"IEND", b"")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(png)


def base_capture(url="http://127.0.0.1:9999/", dpr=2) -> dict:
    return {
        "url": url,
        "capturedAt": "2026-11-21T00:00:00.000Z",
        "deviceScaleFactor": dpr,
        "viewports": {
            "desktop": {
                "width": 1440,
                "height": 900,
                "focus": {"reached": 5, "withoutIndicator": [], "obscured": []},
                "checks": {
                    "title": "Demo Tool",
                    "lang": "en",
                    "metaViewport": "width=device-width, initial-scale=1",
                    "smallText": [],
                    "longLines": [],
                    "smallTargets": [],
                    "clickableNotFocusable": [],
                    "imgNoDims": [],
                    "headings": [{"level": 1, "text": "Demo Tool"}],
                    "skippedHeadingLevels": [],
                    "h1Count": 1,
                    "landmarks": {"main": 1, "nav": 1, "header": 1, "footer": 0},
                    "readability": None,
                },
            },
            "mobile": {
                "width": 390,
                "height": 844,
                "checks": {
                    "title": "Demo Tool",
                    "metaViewport": "width=device-width, initial-scale=1",
                    "smallText": [],
                    "longLines": [],
                    "smallTargets": [],
                    "clickableNotFocusable": [],
                    "imgNoDims": [],
                    "headings": [{"level": 1, "text": "Demo Tool"}],
                    "skippedHeadingLevels": [],
                    "h1Count": 1,
                    "landmarks": {"main": 1, "nav": 1, "header": 1, "footer": 0},
                    "readability": None,
                },
            },
        },
        "axe": [],
        "consoleErrors": [],
        "reflow320": {"viewportWidth": 320, "scrollWidth": 320, "horizontalScroll": False, "offenders": []},
        "cwv": {"profile": "mobile", "lcpMs": 800, "cls": 0.0, "tbtMs": 20, "throttling": {"cpuSlowdown": 4}},
        "tasks": [{"id": "t1", "goal": "Calculate", "viewport": "desktop", "success": True, "steps": [], "inpMs": 40, "outcomeChecks": 1, "screenshots": "tasks/t1"}],
        "summary": {
            "stack": ["React"],
            "axe": {"critical": 0, "serious": 0, "moderate": 0, "minor": 0},
            "reflow320HorizontalScroll": False,
            "focusStops": 5,
            "focusWithoutIndicator": 0,
            "focusObscured": 0,
            "clickableNotFocusable": 0,
            "cwv": {"lcpMs": 800, "cls": 0.0, "tbtMs": 20},
            "tasks": {"total": 1, "succeeded": 1, "maxInpMs": 40, "withoutOutcomeCheck": []},
            "consoleErrors": 0,
        },
    }


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n")


class UiReviewUnitTests(unittest.TestCase):
    def setUp(self):
        scratch = Path.home() / ".t3" / "scratch"
        scratch.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(prefix="sgstack-uireview-", dir=scratch)
        self.addCleanup(self.temp.cleanup)
        self.work = Path(self.temp.name)

    def run_node(self, script: str, *args, env=None) -> subprocess.CompletedProcess:
        return subprocess.run(
            ["node", str(SCRIPTS / script), *args],
            cwd=self.work,
            env=env or os.environ,
            check=True,
            capture_output=True,
            text=True,
        )

    def test_gates_consensus_diagnostic_scores_waivers_and_contested_pairwise(self):
        iter_dir = self.work / "run/iter-1"
        write_json(iter_dir / "capture.json", base_capture())
        write_json(
            iter_dir / "jury/experts.json",
            {
                "mode": "experts",
                "reviews": [
                    {"provider": "claude", "ok": True, "advisory": False, "strengths": ["Calm compact density", "Clear hierarchy"]},
                    {"provider": "codex", "ok": True, "advisory": False, "strengths": ["Clear hierarchy"]},
                ],
                "findings": [
                    {
                        "id": "F1",
                        "title": "Add hero badge and promotional callout",
                        "kind": "suggestion",
                        "category": "visual",
                        "framework": "Visual design",
                        "severity": 3,
                        "evidence": "Header feels utilitarian",
                        "where": {"viewport": "desktop", "selector": "header", "text": "Demo Tool"},
                        "fix": "Add accent badge",
                        "tradeoff": "Adds visual clutter",
                        "source": "claude",
                        "advisory": False,
                    }
                ],
            },
        )
        write_json(
            iter_dir / "jury/personas.json",
            {
                "mode": "personas",
                "rounds": 1,
                "jurors": [
                    {
                        "persona": "first-timer-mobile",
                        "provider": "claude",
                        "round": 1,
                        "ok": True,
                        "advisory": False,
                        "scores": {"ueqsPragmatic": 1.8, "ueqsHedonic": 0.0, "ueqsOverall": 0.9, "sus": 85, "visawi": 4.2},
                        "top_issues": [{"title": "Dense table layout", "where": "mobile", "evidence": "Compact", "severity": 2}],
                    },
                    {
                        "persona": "keyboard-screenreader",
                        "provider": "claude",
                        "round": 1,
                        "ok": True,
                        "advisory": False,
                        "scores": {"ueqsPragmatic": 1.6, "ueqsHedonic": -0.2, "ueqsOverall": 0.7, "sus": 82, "visawi": None},
                        "top_issues": [],
                    },
                ],
                "aggregate": {
                    "ueqsPragmatic": {"mean": 1.7, "min": 1.6, "max": 1.8, "sd": 0.1, "se": 0.1, "n": 2},
                    "ueqsHedonic": {"mean": -0.1, "min": -0.2, "max": 0.0, "sd": 0.1, "se": 0.1, "n": 2},
                    "ueqsOverall": {"mean": 0.8, "min": 0.7, "max": 0.9, "sd": 0.1, "se": 0.1, "n": 2},
                    "sus": {"mean": 83.5, "min": 82, "max": 85, "sd": 1.5, "se": 1.5, "n": 2},
                    "visawi": {"mean": 4.2, "min": 4.2, "max": 4.2, "sd": 0, "se": None, "n": 1},
                },
            },
        )
        write_json(
            iter_dir / "jury/pairwise.json",
            {
                "mode": "pairwise",
                "votes": [],
                "tally": {"after": 2, "before": 2, "tie": 0, "failed": 0},
                "providerSummary": {"claude": {"after": 0, "before": 2, "tie": 0}, "codex": {"after": 2, "before": 0, "tie": 0}},
                "providerAgainst": ["claude"],
                "verdict": "contested",
            },
        )
        waivers = self.work / "run/waivers.json"
        write_json(waivers, [{"title": "Dense table layout", "match": "dense table", "reason": "Intentional compact density"}])

        self.run_node("gates.mjs", "--iter", str(iter_dir), "--waivers", str(waivers))
        gates_doc = json.loads((iter_dir / "gates.json").read_text())
        by_id = {g["id"]: g for g in gates_doc["gates"]}

        # Uncorroborated single-expert severity-3 suggestion must NOT fail expert-severity.
        self.assertEqual(by_id["expert-severity"]["status"], "pass")
        # Hedonic and VisAWI are diagnostic by default (skip, not fail).
        self.assertEqual(by_id["ueqs-hedonic"]["status"], "skip")
        self.assertEqual(by_id["ueqs-hedonic"]["target"], "diagnostic")
        self.assertEqual(by_id["visawi"]["status"], "skip")
        # ueqs-min-juror evaluates pragmatic min (1.6 >= 0.8), not overall min (0.7).
        self.assertEqual(by_id["ueqs-min-juror"]["status"], "pass")
        # Contested pairwise (2:2 provider split) must FAIL.
        self.assertEqual(by_id["pairwise"]["status"], "fail")

        worklist = json.loads((iter_dir / "worklist.json").read_text())
        self.assertEqual(worklist["strengths"], ["Calm compact density", "Clear hierarchy"])
        self.assertEqual(worklist["defects"], [])
        self.assertEqual(gates_doc["openDefectCount"], 0)
        # Waived persona issue must be filtered out; uncorroborated expert suggestion remains in suggestions with tradeoff.
        self.assertEqual(len(worklist["suggestions"]), 1)
        self.assertEqual(worklist["suggestions"][0]["tradeoff"], "Adds visual clutter")

        # Now add a corroborating finding from Codex -> must fail expert-severity and enter defects.
        experts = json.loads((iter_dir / "jury/experts.json").read_text())
        experts["findings"].append(
            {
                "id": "F2",
                "title": "Promotional callout missing in header",
                "kind": "suggestion",
                "category": "visual",
                "framework": "Visual design",
                "severity": 2,
                "evidence": "Header is plain",
                "where": {"viewport": "desktop", "selector": "header", "text": "Demo Tool"},
                "fix": "Add header badge",
                "tradeoff": "More noise",
                "source": "codex",
                "advisory": False,
            }
        )
        write_json(iter_dir / "jury/experts.json", experts)
        self.run_node("gates.mjs", "--iter", str(iter_dir), "--waivers", str(waivers))
        gates_doc2 = json.loads((iter_dir / "gates.json").read_text())
        by_id2 = {g["id"]: g for g in gates_doc2["gates"]}
        self.assertEqual(by_id2["expert-severity"]["status"], "fail")
        worklist2 = json.loads((iter_dir / "worklist.json").read_text())
        self.assertEqual(len(worklist2["defects"]), 1)
        self.assertEqual(worklist2["defects"][0]["findingId"], "F1")

    @unittest.skipUnless((NODE_MODULES / "pngjs").exists(), "pngjs not installed")
    def test_jury_dry_run_blind_persona_truncation_and_symmetric_pairwise(self):
        # Provide fake claude/codex binaries on PATH so resolveProviders() succeeds during --dry-run.
        bin_dir = self.work / "bin"
        bin_dir.mkdir()
        for name in ("claude", "codex"):
            exe = bin_dir / name
            exe.write_text("#!/bin/sh\nexit 0\n")
            exe.chmod(0o755)
        env = os.environ | {"PATH": str(bin_dir) + os.pathsep + os.environ["PATH"]}

        run_dir = self.work / "run"
        for name in ("iter-0", "iter-1"):
            d = run_dir / name
            write_json(d / "capture.json", base_capture(dpr=2))
            (d / "aria-desktop.txt").write_text("- heading \"Demo Tool\"\n")
            make_png(d / "desktop.png", 200, 120)
            make_png(d / "mobile.png", 100, 160)
            # Tall 2x full-page image (> 2 tiles of 3200px) to verify truncation notice.
            make_png(d / "desktop-full.png", 40, 7000)
            make_png(d / "mobile-full.png", 40, 1000)
            make_png(d / "reflow-320.png", 80, 120)
        # Create fake detail crops in iter-1 to confirm pairwise no longer attaches them.
        write_json(run_dir / "iter-1/crops/crops.json", [{"id": "C1.1", "phase": "before", "ok": True, "used": "selector"}, {"id": "C1.1", "phase": "after", "ok": True, "used": "selector"}])
        make_png(run_dir / "iter-1/crops/C1.1-before.png", 60, 40)
        make_png(run_dir / "iter-1/crops/C1.1-after.png", 60, 40)

        cfg = run_dir / "config.json"
        write_json(cfg, {"profile": {"kind": "app", "density": "compact", "notes": "Keep dense table"}, "jury": {"maxImagesPairwise": 6}})

        self.run_node("jury.mjs", "personas", "--iter", str(run_dir / "iter-1"), "--config", str(cfg), "--dry-run", env=env)
        blind_prompt = (run_dir / "iter-1/jury/raw/persona-claude-keyboard-screenreader.prompt.md").read_text()
        sighted_prompt = (run_dir / "iter-1/jury/raw/persona-claude-first-timer-mobile.prompt.md").read_text()
        self.assertIn("No screenshots provided", blind_prompt)
        self.assertNotIn("VisAWI-S", blind_prompt)
        self.assertNotIn('"visawi"', blind_prompt)
        self.assertIn("VisAWI-S", sighted_prompt)
        self.assertIn('"visawi"', sighted_prompt)

        self.run_node("jury.mjs", "experts", "--iter", str(run_dir / "iter-1"), "--config", str(cfg), "--dry-run", env=env)
        expert_prompt = (run_dir / "iter-1/jury/raw/expert-claude.prompt.md").read_text()
        self.assertIn("kind: app; density: compact; notes: Keep dense table", expert_prompt)
        self.assertIn("full-page screenshots were capped", expert_prompt)
        self.assertIn('"tradeoff"', expert_prompt)

        self.run_node("jury.mjs", "pairwise", "--iter", str(run_dir / "iter-1"), "--before", str(run_dir / "iter-0"), "--tag", "baseline", "--config", str(cfg), "--dry-run", env=env)
        pw_prompt = (run_dir / "iter-1/jury/raw/pairwise-baseline-claude-before-first.prompt.md").read_text()
        self.assertIn('"restraint"', pw_prompt)
        self.assertNotIn("detail 1", pw_prompt)
        # Symmetric cap: maxImagesPairwise=6 -> exactly 3 version A and 3 version B images.
        self.assertEqual(pw_prompt.count("(version A,"), 3)
        self.assertEqual(pw_prompt.count("(version B,"), 3)
        self.assertTrue((run_dir / "iter-1/jury/pairwise-baseline.json").exists())

    @unittest.skipUnless((NODE_MODULES / "playwright").exists(), "Playwright not installed")
    def test_report_averages_repeat_rounds_and_renders_strengths_and_split_findings(self):
        run_dir = self.work / "run-report"
        for name, prag_r1, prag_r2 in (("iter-0", 1.0, 1.0), ("iter-1", 1.2, 1.8)):
            d = run_dir / name
            write_json(d / "capture.json", base_capture())
            make_png(d / "desktop.png", 120, 80)
            make_png(d / "desktop-full.png", 120, 80)
            make_png(d / "mobile.png", 60, 80)
            make_png(d / "mobile-full.png", 60, 80)
            write_json(
                d / "jury/personas.json",
                {
                    "mode": "personas",
                    "rounds": 2,
                    "jurors": [
                        {"persona": "first-timer-mobile", "provider": "claude", "round": 1, "ok": True, "scores": {"ueqsPragmatic": prag_r1, "ueqsHedonic": 0.2, "ueqsOverall": 0.6, "sus": 80, "visawi": 5.0}, "rationale": {"pragmatic": "Ok", "hedonic": "Ok", "visual": "Clean"}},
                        {"persona": "first-timer-mobile", "provider": "claude", "round": 2, "ok": True, "scores": {"ueqsPragmatic": prag_r2, "ueqsHedonic": 0.4, "ueqsOverall": 0.9, "sus": 84, "visawi": 5.2}, "rationale": {"pragmatic": "Good", "hedonic": "Ok", "visual": "Clean"}},
                        {"persona": "keyboard-screenreader", "provider": "claude", "round": 1, "ok": True, "scores": {"ueqsPragmatic": 1.5, "ueqsHedonic": 0.0, "ueqsOverall": 0.75, "sus": 82, "visawi": None}, "rationale": {"pragmatic": "Clear", "hedonic": "Fine"}},
                    ],
                    "aggregate": {},
                },
            )
            write_json(
                d / "jury/experts.json",
                {
                    "mode": "experts",
                    "reviews": [{"provider": "claude", "ok": True, "advisory": False, "strengths": ["Clean spacing"]}],
                    "findings": [
                        {"id": "F1", "title": "Real defect", "kind": "defect", "category": "accessibility", "framework": "WCAG 2.4.7", "severity": 3, "evidence": "Missing focus", "fix": "Add focus ring", "tradeoff": "none", "source": "claude"},
                        {"id": "F2", "title": "Optional banner", "kind": "suggestion", "category": "visual", "framework": "Visual design", "severity": 2, "evidence": "Plain top", "fix": "Add intro banner", "tradeoff": "Adds vertical height", "source": "claude"},
                    ],
                },
            )
            write_json(d / "gates.json", {"iteration": name, "pass": True, "complete": True, "gates": []})
        write_json(run_dir / "iter-1/jury/pairwise-baseline.json", {"verdict": "after", "tally": {"after": 4, "before": 0, "tie": 0}})

        self.run_node("report.mjs", "--run", str(run_dir))
        html = (run_dir / "report/index.html").read_text()
        summary = (run_dir / "report/summary.md").read_text()
        # Mean of 1.2 and 1.8 is 1.50 (not overwritten with 1.80).
        self.assertIn("1 → <strong>1.50</strong>", html)
        self.assertIn("– → <strong>–</strong>", html)
        self.assertNotIn("<p><strong>Visual.</strong> </p>", html)
        self.assertIn("What already works", html)
        self.assertIn("Clean spacing", html)
        self.assertIn("Open defects (1)", html)
        self.assertIn("Design suggestions (1)", html)
        self.assertIn("Adds vertical height", html)
        self.assertIn("Blind comparison vs. iter-0: after", html)
        self.assertIn("## What already works", summary)
        self.assertIn("## Design suggestions", summary)

    @unittest.skipUnless((NODE_MODULES / "playwright").exists(), "Playwright not installed")
    def test_probes_avoid_false_positives_on_modern_patterns(self):
        site = self.work / "site"
        site.mkdir()
        (site / "index.html").write_text(
            """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Modern App</title>
  <style>
    body { margin: 0; font: 14px/1.4 system-ui, sans-serif; }
    .tab { cursor: pointer; padding: 8px 12px; display: inline-block; }
    .fake-btn { cursor: pointer; padding: 8px 12px; display: inline-block; }
    .input-wrap { border: 1px solid #999; padding: 4px; display: inline-block; }
    .input-wrap:focus-within { border-color: #0055ff; box-shadow: 0 0 0 2px #0055ff; }
    .input-wrap input { outline: none; border: 0; height: 28px; }
    .pseudo-btn { position: relative; outline: none; padding: 8px 14px; }
    .pseudo-btn:focus-visible::after { content: ""; position: absolute; inset: -3px; border: 2px solid #0055ff; }
    .compact-btn { width: 32px; height: 32px; }
    .tiny-btn { width: 16px; height: 16px; padding: 0; }
    .wide { width: 1100px; }
  </style>
</head>
<body>
  <main>
    <h1>Modern App</h1>
    <div role="tablist">
      <div role="tab" tabindex="0" class="tab">Tab 1</div>
      <div role="tab" tabindex="-1" class="tab">Tab 2</div>
    </div>
    <div class="fake-btn" onclick="void 0">Not focusable</div>
    <label class="input-wrap">Search <input type="text"></label>
    <button type="button" class="pseudo-btn">Action</button>
    <button type="button" class="compact-btn">Go</button>
    <button type="button" class="tiny-btn">x</button>
    <p class="wide">Ready to start. <a href="#more">Inline link</a></p>
    <p class="wide">This is a deliberately very long single paragraph with well over ninety characters so the line length probe should definitely report it as a wide prose line.</p>
    <table><tr><td>Switch-A</td><td>10 Gbps</td><td>42%</td></tr></table>
  </main>
</body>
</html>
"""
        )

        class QuietHandler(SimpleHTTPRequestHandler):
            def __init__(self, *a, **kw):
                super().__init__(*a, directory=str(site), **kw)

            def log_message(self, format, *args):
                pass

        server = ThreadingHTTPServer(("127.0.0.1", 0), QuietHandler)
        port = server.server_address[1]
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(server.shutdown)
        self.addCleanup(server.server_close)

        out = self.work / "cap"
        self.run_node("capture.mjs", "capture", "--url", f"http://127.0.0.1:{port}/", "--out", str(out), "--skip-cwv")
        cap = json.loads((out / "capture.json").read_text())

        # Retina default DPR = 2.
        self.assertEqual(cap["deviceScaleFactor"], 2)
        # Roving tabindex tab is NOT flagged; real onclick div IS flagged.
        cnf = cap["viewports"]["desktop"]["checks"]["clickableNotFocusable"]
        self.assertEqual(len(cnf), 1)
        self.assertIn("Not focusable", cnf[0]["text"])
        # :focus-within wrapper and ::after focus ring are both recognized.
        focus = cap["viewports"]["desktop"]["focus"]
        self.assertEqual(focus["withoutIndicator"], [])
        # Short <p> in wide container is ignored; long >90-char <p> is caught.
        long_lines = cap["viewports"]["desktop"]["checks"]["longLines"]
        self.assertEqual(len(long_lines), 1)
        # Mobile smallTargets catches only <24px non-inline controls (tiny-btn), ignoring 32px button and inline link.
        small_targets = cap["viewports"]["mobile"]["checks"]["smallTargets"]
        self.assertEqual([t["text"] for t in small_targets], ["x"])
        # Readability ignores app chrome and requires >=3 prose sentences -> null here.
        self.assertIsNone(cap["viewports"]["desktop"]["checks"]["readability"])


if __name__ == "__main__":
    unittest.main()
