# Gran 👵🏻

[![npm version](https://img.shields.io/npm/v/%40kkarimi%2Fgran?label=npm)](https://www.npmjs.com/package/@kkarimi/gran)
[![CI](https://img.shields.io/github/actions/workflow/status/kkarimi/gran/ci.yml?branch=main&label=ci)](https://github.com/kkarimi/gran/actions/workflows/ci.yml)
[![Docs](https://img.shields.io/badge/docs-live-0f766e)](https://kkarimi.github.io/gran/)
[![License](https://img.shields.io/github/license/kkarimi/gran)](https://github.com/kkarimi/gran/blob/main/LICENSE)

The unofficial open-source Swiss army knife for Granola.

Sync your meeting archive locally, browse it in the browser or terminal, export it into knowledge
bases you own, and run your own agents against transcripts and notes.

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

## Start

```bash
gran init
```

## Documentation

The full docs live at [kkarimi.github.io/gran](https://kkarimi.github.io/gran/).

Start with:

- [Overview](https://kkarimi.github.io/gran/docs/)
- [Getting started](https://kkarimi.github.io/gran/docs/getting-started/)
- [Workflows and examples](https://kkarimi.github.io/gran/docs/workflows/)
- [SDK](https://kkarimi.github.io/gran/docs/sdk/)
- [Automation and BYOA](https://kkarimi.github.io/gran/docs/automation/)
- [Auth and configuration](https://kkarimi.github.io/gran/docs/auth-and-configuration/)

Release history is also tracked in
[`CHANGELOG.md`](https://github.com/kkarimi/gran/blob/main/CHANGELOG.md).

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for local setup, QA
expectations, and contribution workflow.

## Local Development

```bash
curl -fsSL https://vite.plus | bash
vp install
npm run docs:check
vp pack
node dist/cli.js --help
```
