# README notice (baseline v2)

Every repo's README.md carries an AI notice in two places. Copy the parts
below; do not reword them.

## 1. Notice box

Directly after the title and the one- or two-sentence description, before
the first `##` section. Pick one variant.

Default (`NOTE`, blue):

```markdown
> [!NOTE]
> Personal project, built with AI coding agents under my supervision. Review the code carefully before you use it.
```

Experimental repos (`WARNING`, amber): early or unstable code, no tests, no
releases, or not used regularly. Keep `WARNING` rare so it stays a signal.

```markdown
> [!WARNING]
> Personal project, built with AI coding agents under my supervision. Review the code carefully before you use it.
> Experimental: not intended for production use.
```

## 2. Status section

At the end of the README, directly before `## License` (or as the last
section if there is none):

```markdown
## Status

Personal project, built with AI coding agents under my supervision. There is
no support and no stability guarantee; review the code carefully before you
rely on it. See [LICENSE](LICENSE) for the warranty terms.
```

Drop the LICENSE sentence in repos without a LICENSE file.
