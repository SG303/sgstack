#!/usr/bin/env bash
# Non-invasive git snapshots of the working tree (tracked + untracked, honouring
# .gitignore) so every iteration can be diffed and reverted without commits,
# branches or stashes.
#
#   snapshot.sh take DIR          -> prints a tree id and writes DIR/tree.txt
#   snapshot.sh diff DIR_A DIR_B  -> writes DIR_B/changes.patch and prints the diffstat
#   snapshot.sh exclude           -> adds .ui-review/ to .git/info/exclude
set -euo pipefail

cmd="${1:-}"
git rev-parse --show-toplevel >/dev/null 2>&1 || {
	echo "not a git repository: snapshots disabled" >&2
	exit 3
}
top="$(git rev-parse --show-toplevel)"

take_tree() {
	local index
	index="$(mktemp)"
	# Start from HEAD's index so unchanged files are cheap, then add everything.
	GIT_INDEX_FILE="$index" git -C "$top" read-tree HEAD 2>/dev/null || true
	GIT_INDEX_FILE="$index" git -C "$top" add -A -- . ':!.ui-review' >/dev/null
	GIT_INDEX_FILE="$index" git -C "$top" write-tree
	rm -f "$index"
}

case "$cmd" in
take)
	dir="${2:?usage: snapshot.sh take DIR}"
	mkdir -p "$dir"
	tree="$(take_tree)"
	echo "$tree" >"$dir/tree.txt"
	echo "$tree"
	;;
diff)
	a="${2:?usage: snapshot.sh diff DIR_A DIR_B}"
	b="${3:?usage: snapshot.sh diff DIR_A DIR_B}"
	ta="$(cat "$a/tree.txt")"
	tb="$(cat "$b/tree.txt")"
	git -C "$top" diff --no-color "$ta" "$tb" >"$b/changes.patch"
	git -C "$top" diff --stat --no-color "$ta" "$tb"
	;;
exclude)
	exclude="$(git -C "$top" rev-parse --git-path info/exclude)"
	[[ $exclude == /* ]] || exclude="$top/$exclude"
	mkdir -p "$(dirname "$exclude")"
	grep -qxF '.ui-review/' "$exclude" 2>/dev/null || echo '.ui-review/' >>"$exclude"
	echo "excluded .ui-review/ via $exclude"
	;;
*)
	echo "usage: snapshot.sh take DIR | diff DIR_A DIR_B | exclude" >&2
	exit 2
	;;
esac
