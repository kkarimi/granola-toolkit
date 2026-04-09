# Gran 👵🏻

[![npm version](https://img.shields.io/npm/v/%40kkarimi%2Fgran?label=npm)](https://www.npmjs.com/package/@kkarimi/gran)
[![CI](https://img.shields.io/github/actions/workflow/status/kkarimi/gran/ci.yml?branch=main&label=ci)](https://github.com/kkarimi/gran/actions/workflows/ci.yml)
[![Docs](https://img.shields.io/badge/docs-live-0f766e)](https://kkarimi.github.io/gran/)
[![License](https://img.shields.io/github/license/kkarimi/gran)](https://github.com/kkarimi/gran/blob/main/LICENSE)

The unofficial open-source Swiss army knife for Granola.

Sync your meeting archive locally, browse it in the browser or terminal, export anything you need,
and run your own agents against transcripts and notes.

> `gran` is for people who want more than a flat export command:
> a local-first Granola archive, a real browser and terminal workspace, and automation you control.

## Why Use It

- Local-first control instead of being trapped in one app surface
- CLI, browser, and TUI on one shared runtime and one local index
- Bring your own agent workflows on top of transcripts and notes
- Export notes and transcripts into files you actually own
- Open-source and scriptable, with local prompts, rules, skills, and plugins

## What You Get

- `gran sync` for local indexing and refresh
- `gran web` for a browser workspace
- `gran tui` / `gran attach` for keyboard-first terminal use
- `gran export` for bundled note + transcript exports
- `gran targets` for named vaults, folders, and export profiles
- `gran intelligence` for built-in presets like decisions and action items
- `gran automation` plus harnesses/rules for BYOA review workflows
- `@kkarimi/gran-sdk` for Node and TypeScript integrations on the same local-first core
- local diagnostics, sync history, and inspectable runtime state

## Install

```bash
npm install -g @kkarimi/gran
gran --help
```

Without a global install:

```bash
npx @kkarimi/gran --help
```

If you want the SDK instead of the CLI:

```bash
npm install @kkarimi/gran-sdk
```

If you do not want to install via npm, each GitHub release also publishes standalone archives for
macOS arm64, Linux x64, and Windows x64. Extract the archive and run `gran` (or `gran.exe` on
Windows).

## Start Here

```bash
gran init
```

In an interactive terminal, `gran init` now offers a guided setup flow that:

1. creates a local `.gran.json` plus editable files under `./.gran/`
2. asks whether you want the browser workspace or terminal workspace
3. lets you save a Personal API key or import the desktop session
4. runs the first import
5. opens the workspace you picked

If you skip the guide or run `gran init` in a non-interactive shell, the shortest follow-up is:

```bash
gran web --config ./.gran.json
gran tui --config ./.gran.json
```

`gran web` still prefers the long-running background-service path by default: it will reuse the
existing service when one is already running, or start it for you when you have not asked for a
foreground/debug session.

## Example Workflows

### Local Archive And Browser Workspace

```bash
gran init
```

Use this when you want the fastest way to get your Granola archive into a local workspace you can
actually use every day.

### Obsidian Vault Publishing

```bash
gran init --provider openrouter
gran targets add --id work-vault --kind obsidian-vault --output ~/Vaults/Work --daily-notes-dir Daily
gran export --target work-vault
```

Use this when your main goal is to keep notes and transcripts in an Obsidian vault you own.

### Review-First Meeting Notes

```bash
gran init --provider openrouter
```

Then choose the browser workspace in guided setup. After the first import, open
`Settings -> Automation`, enable the automation plugin, keep the starter harness or edit it, and
review drafts before anything is published.

### Terminal-First Use

```bash
gran init
```

Choose the terminal workspace in guided setup if you want to stay in the terminal from the first
run.

## Project Setup And Config

`gran init` writes a project-local `.gran.json` for you. That is the normal way to set up a
project. If you want to inspect or edit the generated config and companion files directly, see
[`Auth and configuration`](https://kkarimi.github.io/gran/docs/auth-and-configuration/) in the
docs.

Configuration precedence is:

1. command-line flags
2. environment variables
3. `.gran.json`
4. platform defaults

Relative paths in `.gran.json` resolve from the directory that contains the config file.

## Debug Logging

Yes, the toolkit supports a real debug mode.

```bash
gran sync --debug
gran web --debug --foreground
DEBUG_MODE=1 gran service start
```

Useful when you want to see config resolution, auth mode selection, sync behaviour, and runtime
paths while diagnosing local-state issues.

## Documentation

The detailed documentation lives at
[`kkarimi.github.io/gran`](https://kkarimi.github.io/gran/).

Local docs development:

```bash
npm run docs:dev
npm run docs:check
```

Key docs entry points:

- [`Overview`](https://kkarimi.github.io/gran/docs/)
- [`Getting Started`](https://kkarimi.github.io/gran/docs/getting-started/)
- [`Workflows`](https://kkarimi.github.io/gran/docs/workflows/)
- [`SDK`](https://kkarimi.github.io/gran/docs/sdk/)
- [`Automation`](https://kkarimi.github.io/gran/docs/automation/)
- [`Server, Web, and TUI`](https://kkarimi.github.io/gran/docs/server-web-and-tui/)
- [`Auth and Configuration`](https://kkarimi.github.io/gran/docs/auth-and-configuration/)
- [`Exporting`](https://kkarimi.github.io/gran/docs/exporting/)
- [`Meetings and Folders`](https://kkarimi.github.io/gran/docs/meetings-and-folders/)
- [`Agent Skills`](https://kkarimi.github.io/gran/docs/agent-skills/)
- [`Architecture`](https://kkarimi.github.io/gran/docs/architecture/)
- [`Releases`](https://kkarimi.github.io/gran/docs/releases/)
- [`Development`](https://kkarimi.github.io/gran/docs/development/)

Release history is also tracked in
[`CHANGELOG.md`](https://github.com/kkarimi/gran/blob/main/CHANGELOG.md).

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for local setup, QA
expectations, and contribution workflow.

## Local Development

```bash
curl -fsSL https://vite.plus | bash
vp install
npm run web:check
vp pack
node dist/cli.js --help
```
