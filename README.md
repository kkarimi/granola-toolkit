# granola-toolkit

Toolkit for working with Granola meetings, notes, transcripts, folders, and local workspaces.

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
granola service start
granola web
```

`granola init` creates a local `.granola.toml`, starter harnesses, starter automation rules, and
prompt files under `./.granola/` so the first-run setup is not just “read docs and assemble JSON by
hand”.

If you start with `granola web`, the browser now walks you through the same first-run path:
enter a Granola API key, import your meetings, choose an agent provider, and land in a workspace
with a starter reviewable notes pipeline already configured.

`granola service start` is the new long-running background mode. It keeps the local sync loop warm,
serves the browser workspace, and lets `granola attach` discover the running service without making
you keep a foreground terminal open.

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
- [`Exporting`](https://kkarimi.github.io/granola-toolkit/docs/exporting/)
- [`Meetings and Folders`](https://kkarimi.github.io/granola-toolkit/docs/meetings-and-folders/)
- [`Server, Web, and TUI`](https://kkarimi.github.io/granola-toolkit/docs/server-web-and-tui/)
- [`Auth and Configuration`](https://kkarimi.github.io/granola-toolkit/docs/auth-and-configuration/)
- [`Development`](https://kkarimi.github.io/granola-toolkit/docs/development/)

## Local Development

```bash
curl -fsSL https://vite.plus | bash
vp install
npm run web:check
vp pack
node dist/cli.js --help
```
