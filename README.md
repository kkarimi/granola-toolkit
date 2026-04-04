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

## Quick Start

```bash
granola auth login
granola sync
granola sync --watch
granola folder list
granola meeting list --limit 10
granola notes --folder Team
granola web
granola tui
```

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
vp pack
node dist/cli.js --help
```
