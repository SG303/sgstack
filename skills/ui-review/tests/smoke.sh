#!/usr/bin/env bash
# Deterministic smoke test without LLM calls: serves the deliberately broken fixture,
# runs capture (with tasks) and the gates, and checks that the probes catch the
# planted problems. Full end-to-end tests (jury, fix loop) are described in tests/README.md.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
scripts="$here/../scripts"
out="$(mktemp -d)"
port="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')"

python3 -m http.server "$port" --bind 127.0.0.1 --directory "$here/fixture" >/dev/null 2>&1 &
server=$!
trap 'kill "$server" 2>/dev/null; rm -rf "$out"' EXIT
for _ in $(seq 1 50); do
	if curl -fs "http://127.0.0.1:$port/" >/dev/null; then break; fi
	sleep 0.1
done

bash "$scripts/setup.sh" >/dev/null
cat >"$out/config.json" <<'JSON'
{ "capture": { "views": [{ "id": "booking", "viewport": "desktop", "steps": [{ "action": "click", "any": [{ "role": "link", "name": "Buchen" }] }] }] } }
JSON
node "$scripts/capture.mjs" capture --url "http://127.0.0.1:$port/" --out "$out/iter-0" --tasks "$here/fixture-tasks.json" --config "$out/config.json" >/dev/null 2>&1
node "$scripts/gates.mjs" --iter "$out/iter-0" --config "$out/config.json" >/dev/null

# Crops: a sticky element after another crop, a missing element with an anchor, a focus state
# at 320 px, and the accessibility tree next to the crop.
cat >"$out/plan.json" <<'JSON'
[
  { "id": "S1", "selector": "#kontakt", "viewport": "mobile" },
  { "id": "S2", "selector": "#urgency", "viewport": "mobile" },
  { "id": "S3", "selector": "#not-there-yet", "anchor": "#angebot", "viewport": "desktop" },
  { "id": "S4", "selector": "#name", "viewport": "mobile", "width": 320, "setup": [{ "action": "focus", "any": [{ "selector": "#name" }] }] }
]
JSON
node "$scripts/capture.mjs" crop --url "http://127.0.0.1:$port/" --plan "$out/plan.json" --phase after --out "$out/crops" >/dev/null 2>&1

fail=0
expect() {
	local id="$1" want="$2" got
	got="$(jq -r --arg id "$id" '.gates[] | select(.id == $id) | .status' "$out/iter-0/gates.json")"
	if [[ $got == "$want" ]]; then
		echo "ok    $id = $got"
	else
		echo "FAIL  $id = $got (expected $want)"
		fail=1
	fi
}
expect axe-critical fail
expect axe-serious fail
expect reflow-320 fail
expect focus-visible fail
expect keyboard-reachable fail
expect tbt fail
expect inp fail
expect tasks pass
expect lcp pass

stack="$(jq -r '.stack.detected | length' "$out/iter-0/capture.json")"
if [[ $stack == 0 ]]; then
	echo "ok    no framework detected on static fixture"
else
	echo "FAIL  detected a framework on the static fixture"
	fail=1
fi
crop() {
	local id="$1" field="$2" want="$3" got
	got="$(jq -r --arg id "$id" --arg f "$field" '.[] | select(.id == $id) | .[$f]' "$out/crops/crops.json")"
	if [[ $got == "$want" ]]; then
		echo "ok    crop $id $field = $got"
	else
		echo "FAIL  crop $id $field = $got (expected $want)"
		fail=1
	fi
}
crop S1 used selector
crop S2 used selector
crop S2 fixed true
crop S3 used anchor
crop S4 width 320
crop S4 used selector
[[ -s "$out/crops/S4-after.aria.txt" ]] || {
	echo "FAIL  missing accessibility tree for crop S4"
	fail=1
}

for f in desktop.png mobile.png desktop-full.png mobile-full.png reflow-320.png aria-desktop.txt worklist.json tasks.json desktop-view-booking.png desktop-view-booking-full.png; do
	[[ -s "$out/iter-0/$f" ]] || {
		echo "FAIL  missing $f"
		fail=1
	}
done
exit "$fail"
