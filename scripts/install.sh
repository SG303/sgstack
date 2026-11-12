#!/usr/bin/env bash
# Install sgstack for every supported harness by creating symlinks, so that
# `git pull` updates all of them at once. Re-run after adding a skill.
#
# Skills (skills/<name>/):
#   ~/.claude/skills  Claude Code (opencode reads it too)
#   ~/.agents/skills  Codex and opencode
#
# Global rules (global/AGENTS.md):
#   ${CODEX_HOME:-~/.codex}/AGENTS.md  read by Codex
#   ~/.claude/rules/sg303-global.md    read by Claude Code in every project
#   ~/.config/opencode/AGENTS.md       read by opencode
#
# Existing files that are not links to this repo are never touched.
#
# Usage: scripts/install.sh [--uninstall]
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
skill_targets=("$HOME/.claude/skills" "$HOME/.agents/skills")
rules_src="$repo_root/global/AGENTS.md"
rules_links=(
	"${CODEX_HOME:-$HOME/.codex}/AGENTS.md"
	"$HOME/.claude/rules/sg303-global.md"
	"${XDG_CONFIG_HOME:-$HOME/.config}/opencode/AGENTS.md"
)
mode=install

case "${1:-}" in
"") ;;
--uninstall) mode=uninstall ;;
*)
	echo "usage: $0 [--uninstall]" >&2
	exit 2
	;;
esac

# Remove only links created by this installer; preserve user files and links.
remove_owned_link() {
	local src=$1 link=$2
	if [[ -L $link && "$(readlink "$link")" == "$src" ]]; then
		rm "$link"
		echo "removed  $link"
	fi
}

# link_one <source> <link>: create, keep or remove one symlink.
link_one() {
	local src=$1 link=$2

	if [[ $mode == uninstall ]]; then
		remove_owned_link "$src" "$link"
		return
	fi

	mkdir -p "$(dirname "$link")"
	if [[ -L $link && "$(readlink "$link")" == "$src" ]]; then
		echo "ok       $link"
	elif [[ -e $link || -L $link ]]; then
		echo "skipped  $link (exists and is not a link to this repo)" >&2
	else
		ln -s "$src" "$link"
		echo "linked   $link -> $src"
	fi
}

for target in "${skill_targets[@]}"; do
	for skill in "$repo_root"/skills/*/; do
		[[ -f "$skill/SKILL.md" ]] || continue
		link_one "${skill%/}" "$target/$(basename "$skill")"
	done
done

for link in "${rules_links[@]}"; do
	link_one "$rules_src" "$link"
done

# Migrate the legacy Claude link only after the new rule is available.
# Uninstall also cleans up links from installations made before this migration.
claude_rule="$HOME/.claude/rules/sg303-global.md"
if [[ $mode == uninstall || (-L $claude_rule && "$(readlink "$claude_rule")" == "$rules_src") ]]; then
	remove_owned_link "$rules_src" "$HOME/.claude/AGENTS.md"
fi
