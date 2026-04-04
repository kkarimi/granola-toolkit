# AGENTS.md

This file provides guidance for agents working in this repository.

## Project Overview

`granola-toolkit` is now a multi-surface TypeScript toolkit for working with Granola meetings.

Current first-class surfaces:

1. CLI commands for auth, folders, meetings, notes, transcripts, exports, and attach flows
2. a browser workspace via `granola web`
3. a full-screen terminal workspace via `granola tui`
4. a dedicated docs app under `docs/`

The current implementation lives in:

- `index.ts`: CLI entrypoint
- `src/cli.ts`: command parsing and command dispatch
- `src/app/*`: shared application core and shared models/state
- `src/client/*`: auth/session, transport, and Granola API boundaries
- `src/commands/*`: thin command adapters
- `src/server/*`: local server, attach client, and browser API
- `src/tui/*`: `pi-tui` workspace
- `src/web/*`: browser markup, styling, and client helpers
- `src/config.ts`: config loading from flags, env, and `.granola.toml`
- `src/api.ts`: Supabase token parsing and Granola API fetching
- `src/cache.ts`: local Granola cache parsing
- `src/prosemirror.ts`: ProseMirror to Markdown/plain text conversion
- `src/notes.ts`: Markdown note generation and note export writes
- `src/transcripts.ts`: transcript formatting and transcript export writes
- `src/utils.ts`: shared path, filename, HTML fallback, and file-write helpers
- `docs/*`: Fumadocs/Next.js docs app

## Working Conventions

- Default to the Vite+ workflow.
- Use `vp install`, `vp check`, `vp test`, and `vp pack` as the primary development loop.
- Use `npm run docs:dev` and `npm run docs:check` for the docs app.
- Run the built CLI with `node dist/cli.js ...` or the package scripts in `package.json`.
- The release path uses GitHub Actions trusted publishing gated by the `production` environment; do not reintroduce long-lived npm token secrets unless there is a concrete need.
- Do not add `dotenv` unless there is a concrete need; the current CLI reads explicit environment variables only.

Preferred commands:

```bash
vp install
vp check
vp test
npm run coverage
vp pack
npm run docs:check
node dist/cli.js --help
node dist/cli.js notes --help
node dist/cli.js transcripts --help
npm pack --dry-run
npm run release:patch
```

## Configuration Model

Configuration precedence is:

1. command-line flags
2. environment variables
3. `.granola.toml`
4. platform defaults

Relevant settings:

- Global: `--config`, `--debug`, `--supabase`
- Notes: `--output`, `--timeout`
- Transcripts: `--cache`, `--output`

Relevant environment variables:

- `DEBUG_MODE`
- `SUPABASE_FILE`
- `OUTPUT`
- `TIMEOUT`
- `CACHE_FILE`
- `TRANSCRIPT_OUTPUT`

## Granola-Specific Behaviour

### Notes export

- API endpoint: `https://api.granola.ai/v2/get-documents`
- Request method: `POST`
- Request body includes:
  - `limit: 100`
  - `offset`
  - `include_last_viewed_panel: true`
- Required headers currently include:
  - `Authorization: Bearer <token>`
  - `User-Agent: Granola/5.354.0`
  - `X-Client-Version: 5.354.0`
  - `Content-Type: application/json`
  - `Accept: */*`
- Content priority for Markdown export is:
  1. `notes` ProseMirror
  2. `last_viewed_panel.content` ProseMirror
  3. `last_viewed_panel.original_content` HTML fallback
  4. raw `content`

### Transcript export

- Cache data comes from a local Granola JSON file, not the API.
- The cache payload may be double-encoded or already an object.
- Transcript speaker mapping is currently:
  - `microphone` -> `You`
  - everything else -> `System`

## Testing Expectations

- Add or update tests for parser changes, conversion changes, and export behaviour changes.
- Prefer fixture-like payload coverage for API/cache shapes when fixing real-data issues.
- Keep unit tests in `test/*.test.ts` using `vite-plus/test`.
- When changing CLI or config behaviour, verify `vp check`, `vp test`, `npm run coverage`, `vp pack`, and `npm pack --dry-run`.
- When changing docs, also verify `npm run docs:check`.

## Editing Guidance

- Keep the project runtime and tooling Vite+/Node-first unless there is a strong reason not to.
- Prefer extending the current modular layout over collapsing logic back into `src/cli.ts`.
- Be careful with live-data compatibility:
  - Granola payloads can vary between string-encoded and object-encoded JSON fields
  - transcript ordering and note content shapes may differ from synthetic test data
- Preserve incremental export behaviour unless you are intentionally changing it.

## Release Workflow

- Treat a completed TODO item as a release candidate unless there is a clear reason not to ship it yet.
- Any push to `main` with a package version that is not already on npm becomes a publish candidate automatically.
- The GitHub Actions workflow verifies the build, checks whether `package.json` contains an unpublished version, and publishes automatically once the versioned release commit hits `main`.
- Preferred release flows are:
  - merge a PR that already includes the version bump
  - run `npm run release:patch|release:minor|release:major` on `main`

When finishing a TODO item:

1. run `vp check`
2. run `vp test`
3. run `npm run coverage`
4. run `vp pack`
5. run `npm run docs:check`
6. run `npm pack --dry-run`
7. choose a semver bump:
   minor for backward-compatible feature or architecture work
   major for breaking changes
   patch for release-flow, docs, and non-breaking maintenance work
8. bump `package.json` and `package-lock.json`
9. publish the release
10. update `TODO.md` with the version that shipped the completed item

Local release helper behaviour:

1. verifies the git working tree is clean
2. verifies you are on `main`
3. verifies the current npm version is already published
4. runs `vp check`, `vp test`, `npm run coverage`, `vp pack`, `npm run docs:check`, and `npm pack --dry-run`
5. bumps the package version with `npm version --no-git-tag-version`
6. commits and pushes the release commit
7. lets the push-to-`main` workflow publish automatically

Release workflow behaviour:

- installs dependencies with Vite+ via `setup-vp`
- installs docs dependencies in `docs/`
- runs `vp check`, `vp test`, `npm run coverage`, `vp pack`, `npm run docs:check`, and `npm pack --dry-run`
- checks npm first and skips publish if that exact version already exists
- publishes with npm trusted publishing and provenance
- tags the published version as `v<version>`

Required external setup:

1. create a `production` environment in GitHub repository Settings -> Environments
2. keep the workflow filename as `.github/workflows/ci.yml`
3. in npm package settings for `granola-toolkit`, add a GitHub Actions trusted publisher with:
   owner `kkarimi`
   repository `granola-toolkit`
   workflow file `ci.yml`
   environment `production`

## Known Follow-Up Work

Open improvement items are tracked in `TODO.md`. Check that file before making structural changes so new work lines up with current priorities.
