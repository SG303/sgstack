# Tool canon · baseline v1

One tool per job, in every repository. Agents introduce new tools only from
this list. A repo that needs something else records it under "Deviations from
baseline" in its AGENTS.md, with the reason and my OK.

Change this list through a PR to sgstack and bump the baseline version (see
[README](README.md)).

## Everywhere

| Job | Tool | Notes |
| --- | --- | --- |
| Hosting, CI | GitHub, GitHub Actions | No other CI service. |
| Dependency updates | Dependabot | Not Renovate. Template: [`templates/dependabot.yml`](templates/dependabot.yml). |
| Auto-merge of updates | Dependabot + `gh pr merge --auto` | Minor and patch only, after required checks pass. Template: [`templates/workflows/dependabot-auto-merge.yml`](templates/workflows/dependabot-auto-merge.yml). |
| Workflow lint | actionlint | Template: [`templates/workflows/workflow-lint.yml`](templates/workflows/workflow-lint.yml). |
| Workflow security | zizmor | Same workflow as actionlint. |
| Secret detection | GitHub secret scanning + push protection (public repos), gitleaks (local, private repos, history scans) | |
| Code scanning | CodeQL | Only for web apps that run as a service (scio, batzen). Not for PHP, Nix, PowerShell or config repos. |
| Versioning | Semantic Versioning, `vX.Y.Z` tags | Tags and GitHub releases come from CI or the repo's release script, never by hand. |
| Changelog | Keep a Changelog (`CHANGELOG.md`), English | For repos with releases. |
| License | MIT, unless I decide otherwise | Every public repo has a `LICENSE`. |
| Containers | Dockerfile + `compose.yaml`, images on GHCR (`ghcr.io/sg303/<repo>`) | Base images pinned to a version tag, never `:latest`. |
| Editor settings | `.editorconfig` | |

## Per ecosystem

| Ecosystem | Package manager | Lint | Format | Types | Tests |
| --- | --- | --- | --- | --- | --- |
| Python | uv (`pyproject.toml` + `uv.lock`) | ruff | ruff format | – | pytest |
| Node / TypeScript | npm (`package-lock.json`) | ESLint (flat config) | none yet¹ | TypeScript (`tsc`, `svelte-check` for Svelte) | Vitest; Playwright for end-to-end |
| Shell | – | shellcheck | shfmt | – | – |
| PowerShell | – | PSScriptAnalyzer | – | – | Pester, if tests exist |
| Nix | flakes (`flake.lock`) | – | nixfmt | – | – |

¹ No repo uses a formatter for Node today. If one is added, it is Prettier,
introduced in a format-only PR.

## Runtimes

- Node: current LTS. Python: newest version supported by all dependencies.
- Keep the version in sync between Dockerfile, CI and `.nvmrc` /
  `.python-version` / `requires-python`.
- Upgrade before end of life (https://endoflife.date).

## Known deviations to clean up

None. Accepted deviations are listed in each repo's AGENTS.md.
