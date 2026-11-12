#!/usr/bin/env bash
# Installs the ui-review script dependencies (Playwright, axe-core, pixelmatch) next to
# the scripts and makes sure a Chromium build is available. Safe to re-run.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$here"

command -v node >/dev/null || {
	echo "node (>= 18) is required" >&2
	exit 1
}

if [[ ! -d node_modules/playwright || ! -d node_modules/@axe-core/playwright || package.json -nt node_modules || package-lock.json -nt node_modules ]]; then
	npm ci --no-audit --no-fund --silent
	touch node_modules
fi

# Download the matching browser only when missing.
if ! node -e "import('playwright').then(async ({chromium}) => { await (await chromium.launch()).close(); }).catch(() => process.exit(1))" 2>/dev/null; then
	npx playwright install chromium
	if ! node -e "import('playwright').then(async ({chromium}) => { await (await chromium.launch()).close(); }).catch(() => process.exit(1))" 2>/dev/null; then
		echo "Chromium does not start. On Linux run: sudo npx playwright install-deps chromium" >&2
		exit 1
	fi
fi

providers="$(node jury.mjs providers 2>/dev/null || echo '[]')"
echo "ui-review ready. Juror CLIs: $providers"
