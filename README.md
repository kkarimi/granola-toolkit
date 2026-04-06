# granola-toolkit

The unofficial open-source swiss army knife for Granola.

Sync your meeting archive locally, browse it in the browser or terminal, export anything you need,
and run your own agents against transcripts and notes.

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

## Local Development

```bash
curl -fsSL https://vite.plus | bash
vp install
npm run web:check
vp pack
node dist/cli.js --help
```
