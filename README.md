# granola-toolkit

[![npm version](https://img.shields.io/npm/v/granola-toolkit?label=npm)](https://www.npmjs.com/package/granola-toolkit)
[![CI](https://img.shields.io/github/actions/workflow/status/kkarimi/granola-toolkit/ci.yml?branch=main&label=ci)](https://github.com/kkarimi/granola-toolkit/actions/workflows/ci.yml)
[![Docs](https://img.shields.io/badge/docs-live-0f766e)](https://kkarimi.github.io/granola-toolkit/)
[![License](https://img.shields.io/github/license/kkarimi/granola-toolkit)](https://github.com/kkarimi/granola-toolkit/blob/main/LICENSE)

The unofficial open-source Swiss army knife for Granola.

Sync your meeting archive locally, browse it in the browser or terminal, export anything you need,
and run your own agents against transcripts and notes.

> `granola-toolkit` is for people who want more than a flat export command:
> a local-first Granola archive, a real browser and terminal workspace, and automation you control.

## Why Use It

- Local-first control instead of being trapped in one app surface
- CLI, browser, and TUI on one shared runtime and one local index
- Bring your own agent workflows on top of transcripts and notes
- Export notes and transcripts into files you actually own
- Open-source and scriptable, with local prompts, rules, skills, and plugins

## What You Get

- `granola sync` for local indexing and refresh
- `granola web` for a browser workspace
- `granola tui` / `granola attach` for keyboard-first terminal use
- `granola export` for bundled note + transcript exports
- `granola targets` for named vaults, folders, and export profiles
- `granola intelligence` for built-in presets like decisions and action items
- `granola automation` plus harnesses/rules for BYOA review workflows
- local diagnostics, sync history, and inspectable runtime state

## Install

```bash
npm install -g granola-toolkit
granola --help
```

Without a global install:

```bash
npx granola-toolkit --help
```

The published package exposes both `granola` and `granola-toolkit` as executable names.

If you do not want to install via npm, each GitHub release also publishes standalone archives for
macOS arm64, Linux x64, and Windows x64. Extract the archive and run `granola` (or
`granola.exe` on Windows).

## Quick Start

```bash
granola init --provider openrouter
granola auth login --api-key grn_...
granola targets add --id work-vault --kind obsidian-vault --output ~/Vaults/Work --daily-notes-dir Daily
granola export --target work-vault
granola web
```

`granola init` creates a local `.granola.toml`, starter harnesses, starter automation rules, and
prompt files under `./.granola/` so the first-run setup is not just “read docs and assemble JSON by
hand”.

If you start with `granola web`, the browser now walks you through the same first-run path:
enter a Granola API key, import your meetings, choose an agent provider, and land in a workspace
with a starter reviewable notes pipeline already configured.

`granola web` now prefers the long-running background-service path by default: it will reuse the
existing service when one is already running, or start it for you when you have not asked for a
foreground/debug session.

`granola service start` is still available when you want to warm the local sync loop without
opening a browser first.

If you prefer to reuse the desktop app session instead, `granola auth login` still imports it from
`supabase.json`.

## Set Default Configuration

`granola init` writes a project-local `.granola.toml` for you. If you want to edit it directly,
the file can look like this:

```toml
agent-provider = "openrouter"
agent-model = "openai/gpt-5-mini"
agent-harnesses-file = "./.granola/agent-harnesses.json"
automation-rules-file = "./.granola/automation-rules.json"
pkm-targets-file = "./.granola/pkm-targets.json"
output = "./exports/notes"
transcript-output = "./exports/transcripts"
debug = false
```

The CLI reads configuration in this order:

1. command-line flags
2. environment variables
3. `.granola.toml`
4. platform defaults

Relative paths in `.granola.toml` resolve from the directory that contains the config file.

## Debug Logging

Yes, the toolkit supports a real debug mode.

```bash
granola sync --debug
granola web --debug --foreground
DEBUG_MODE=1 granola service start
```

Useful when you want to see config resolution, auth mode selection, sync behaviour, and runtime
paths while diagnosing local-state issues.

## Documentation

The detailed documentation now lives at
[`kkarimi.github.io/granola-toolkit`](https://kkarimi.github.io/granola-toolkit/).

Local docs development:

```bash
npm run docs:dev
npm run docs:check
```

Key docs entry points:

- [`Overview`](https://kkarimi.github.io/granola-toolkit/docs/)
- [`Getting Started`](https://kkarimi.github.io/granola-toolkit/docs/getting-started/)
- [`Automation`](https://kkarimi.github.io/granola-toolkit/docs/automation/)
- [`Server, Web, and TUI`](https://kkarimi.github.io/granola-toolkit/docs/server-web-and-tui/)
- [`Auth and Configuration`](https://kkarimi.github.io/granola-toolkit/docs/auth-and-configuration/)
- [`Exporting`](https://kkarimi.github.io/granola-toolkit/docs/exporting/)
- [`Meetings and Folders`](https://kkarimi.github.io/granola-toolkit/docs/meetings-and-folders/)
- [`Agent Skills`](https://kkarimi.github.io/granola-toolkit/docs/agent-skills/)
- [`Architecture`](https://kkarimi.github.io/granola-toolkit/docs/architecture/)
- [`Releases`](https://kkarimi.github.io/granola-toolkit/docs/releases/)
- [`Development`](https://kkarimi.github.io/granola-toolkit/docs/development/)

Release history is also tracked in
[`CHANGELOG.md`](https://github.com/kkarimi/granola-toolkit/blob/main/CHANGELOG.md).

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](/Users/nima/dev/personal/granola-cli/CONTRIBUTING.md) for
local setup, QA expectations, and contribution workflow.

## Local Development

```bash
curl -fsSL https://vite.plus | bash
vp install
npm run web:check
vp pack
node dist/cli.js --help
```
