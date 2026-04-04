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
granola folder list
granola meeting list --limit 10
granola notes --folder Team
granola web
granola tui
```

## Documentation

The detailed documentation now lives in the dedicated docs app under
[`docs/`](https://github.com/kkarimi/granola-toolkit/tree/main/docs).

Local docs development:

```bash
npm run docs:dev
npm run docs:check
```

Key docs entry points:

- [`Overview`](https://github.com/kkarimi/granola-toolkit/blob/main/docs/content/docs/index.mdx)
- [`Getting Started`](https://github.com/kkarimi/granola-toolkit/blob/main/docs/content/docs/getting-started.mdx)
- [`Exporting`](https://github.com/kkarimi/granola-toolkit/blob/main/docs/content/docs/exporting.mdx)
- [`Meetings and Folders`](https://github.com/kkarimi/granola-toolkit/blob/main/docs/content/docs/meetings-and-folders.mdx)
- [`Server, Web, and TUI`](https://github.com/kkarimi/granola-toolkit/blob/main/docs/content/docs/server-web-and-tui.mdx)
- [`Auth and Configuration`](https://github.com/kkarimi/granola-toolkit/blob/main/docs/content/docs/auth-and-configuration.mdx)
- [`Development`](https://github.com/kkarimi/granola-toolkit/blob/main/docs/content/docs/development.mdx)

## Local Development

```bash
curl -fsSL https://vite.plus | bash
vp install
vp pack
node dist/cli.js --help
```
