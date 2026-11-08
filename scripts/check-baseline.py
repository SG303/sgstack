"""Validate baseline/baseline.yml and the YAML templates.

Run: uv run --no-project --with pyyaml python scripts/check-baseline.py
"""

import pathlib
import sys

import yaml

root = pathlib.Path(__file__).resolve().parent.parent
errors = []

data = yaml.safe_load((root / "baseline/baseline.yml").read_text())
scopes = set(data["scopes"])
ids = [c["id"] for c in data["checks"]]
if len(ids) != len(set(ids)):
    errors.append("duplicate check ids")
for check in data["checks"]:
    if set(check) != {"id", "level", "applies", "check", "how"}:
        errors.append(
            f"{check.get('id')}: fields must be id, level, applies, check, how"
        )
    if check.get("level") not in ("must", "should"):
        errors.append(f"{check.get('id')}: level must be must or should")
    if check.get("applies") not in scopes:
        errors.append(f"{check.get('id')}: unknown scope {check.get('applies')}")

version = f"baseline v{data['version']}"
for path in [
    root / "global/AGENTS.md",
    root / "baseline/tools.md",
    root / "baseline/templates/AGENTS.md",
]:
    if version not in path.read_text():
        errors.append(f"{path.relative_to(root)} does not name {version}")

for path in sorted((root / "baseline/templates").rglob("*.yml")):
    yaml.safe_load(path.read_text())

print("\n".join(errors) or f"ok: {version}, {len(ids)} checks")
sys.exit(1 if errors else 0)
