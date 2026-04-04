# granola-toolkit

Toolkit for working with Granola meetings, notes, and transcripts.

## Install

From npm:

```bash
npm install -g granola-toolkit
granola --help
```

Without a global install:

```bash
npx granola-toolkit --help
npx granola-toolkit meeting --help
```

For local development:

```bash
curl -fsSL https://vite.plus | bash
vp help
vp install
```

## Run

Installed command:

```bash
granola --help
granola attach --help
granola auth login
granola exports --help
granola folder --help
granola meeting --help
granola notes --help
granola serve --help
granola tui --help
granola transcripts --help
granola web --help
```

The published package exposes both `granola` and `granola-toolkit` as executable names.

Local build:

```bash
vp pack
node dist/cli.js --help
node dist/cli.js attach --help
node dist/cli.js exports --help
node dist/cli.js folder --help
node dist/cli.js meeting --help
node dist/cli.js notes --help
node dist/cli.js serve --help
node dist/cli.js tui --help
node dist/cli.js transcripts --help
node dist/cli.js web --help
```

You can also use the package scripts:

```bash
npm run build
npm run start -- meeting --help
npm run notes -- --help
npm run tui -- --help
npm run transcripts -- --help
```

## Examples

Export notes:

```bash
granola auth login
granola notes

node dist/cli.js notes --supabase "$HOME/Library/Application Support/Granola/supabase.json"
node dist/cli.js notes --format json --output ./notes-json
granola exports list
granola exports rerun notes-1234abcd
```

Export transcripts:

```bash
node dist/cli.js transcripts --cache "$HOME/Library/Application Support/Granola/cache-v3.json"
node dist/cli.js transcripts --format yaml --output ./transcripts-yaml
```

Inspect individual meetings:

```bash
granola folder list
granola folder view Team
granola meeting list --limit 10
granola meeting list --search planning
granola meeting list --folder Team
granola meeting view 1234abcd
granola meeting notes 1234abcd
granola meeting transcript 1234abcd --format json
granola meeting export 1234abcd --format yaml
granola meeting open 1234abcd
granola tui
granola tui --meeting 1234abcd
```

Run the local API server:

```bash
granola serve
granola serve --port 4096
granola serve --hostname 0.0.0.0 --port 4096
granola serve --network lan --password "change-me"
granola attach http://127.0.0.1:4096
granola attach http://127.0.0.1:4096 --meeting 1234abcd
granola attach http://127.0.0.1:4096 --password "change-me"

granola web
granola web --meeting 1234abcd
granola web --open=false --port 4096
granola web --network lan --password "change-me" --trusted-origins "https://trusted.example"
```

## How It Works

### Notes

`notes` exports Granola's generated meeting notes, not the raw transcript.

The flow is:

1. read a stored Granola session, or fall back to your local `supabase.json`
2. extract the WorkOS access token from it
3. call Granola's paginated documents API
4. normalise each document into a structured note export
5. choose the best available note content for each document
6. render that export as Markdown, JSON, YAML, or raw JSON
7. write one file per document into the output directory

Content is chosen in this order:

1. `notes`
2. `last_viewed_panel.content`
3. `last_viewed_panel.original_content`
4. raw `content`

Markdown note files include:

- YAML frontmatter with the document id, created timestamp, updated timestamp, and tags
- a top-level heading from the note title
- converted note body content

### Transcripts

`transcripts` exports Granola's locally cached transcript segments.

The flow is:

1. read Granola's cache JSON from disk
2. parse the cache payload, whether it is double-encoded or already an object
3. normalise transcript data into a structured export per document
4. match transcript segments to documents by document id
5. render each export as text, JSON, YAML, or raw JSON
6. write one file per document into the output directory

Speaker labels are currently normalised to:

- `You` for `microphone`
- `System` for everything else

Structured output formats are useful when you want to post-process exports in scripts instead of reading the default human-oriented Markdown or text files.

### Meetings

`meeting` combines the API-backed notes path with the local transcript cache so you can inspect one meeting at a time.

The flow is:

1. read a stored Granola session, or fall back to `supabase.json`
2. fetch documents from Granola's API
3. optionally load the local cache for transcript data
4. resolve a meeting by full id or unique id prefix
5. render either a list, a combined meeting view, focused notes/transcript output, or a machine-readable export bundle

The human-readable `view` command shows:

- meeting metadata
- the selected notes content
- transcript lines when the local cache is available

The focused meeting subcommands are:

- `meeting notes` for just the selected note output
- `meeting transcript` for just the selected transcript output
- `meeting open` to start the web workspace focused on one meeting

The machine-readable `export` command includes:

- a meeting summary
- structured note data plus rendered Markdown
- structured transcript data plus rendered transcript text when available

### Folders

`folder` exposes Granola document lists as a first-class concept instead of leaving meetings in one flat global list.

The flow is:

1. reuse the shared auth path that `notes` and `meeting` already use
2. call Granola's document-list API, with `v2` first and `v1` fallback
3. normalise folder metadata and document membership into shared folder records
4. attach folder membership to meetings in the shared app core
5. let folder commands and meeting filters resolve folders by id, prefix, or unique name

The current CLI surface includes:

- `folder list`
- `folder view <id|name>`
- `meeting list --folder <id|name>`

### Server

`serve` starts a long-lived local `Granola Toolkit` server on one shared app instance.

The initial server API includes:

- `GET /health`
- `GET /server/info`
- `POST /auth/unlock` for password-protected servers
- `POST /auth/lock` to clear the browser/API unlock cookie
- `GET /auth/status`
- `GET /state`
- `GET /events` for server-sent state updates
- `GET /folders`
- `GET /folders/resolve?q=<query>`
- `GET /folders/:id`
- `GET /meetings`
- `GET /meetings?folderId=<id>` for folder-scoped meeting lists
- `GET /meetings?refresh=true` to bypass the local meeting index and force a live refresh
- `GET /meetings/resolve?q=<query>`
- `GET /meetings/:id`
- `GET /exports/jobs`
- `POST /auth/login`
- `POST /auth/logout`
- `POST /auth/mode`
- `POST /auth/refresh`
- `POST /exports/notes`
- `POST /exports/jobs/:id/rerun`
- `POST /exports/transcripts`

This is the shared runtime for `granola web` and `granola attach`.

Server hardening now includes:

- `local` network mode by default, which binds to `127.0.0.1`
- `lan` network mode when you explicitly want other devices to connect
- optional password protection for API routes and the browser client
- trusted-origin checks for browser requests, with CORS headers only for allowed origins
- a warning when you expose the server on `lan` without a password

### Web

`web` starts the same local server as `serve`, enables the browser client at `/`, and opens that workspace in your default browser unless you pass `--open=false`.

You can deep-link into a specific meeting with either:

- `granola web --meeting <id>`
- `granola meeting open <id>`

The initial browser client includes:

- a dedicated folder pane with an explicit All meetings scope
- a searchable meeting list
- folder-aware meeting browsing with one-click scope changes
- a fast local-index warm start for meeting browsing before live documents finish loading
- sort and updated-date filters
- quick open by meeting id or title
- browser URL state that preserves the selected folder, meeting, and tab
- a focused meeting workspace with notes, transcript, metadata, and raw tabs
- keyboard-first workspace switching with `1`-`4`, `[` and `]`
- app-state status from the shared core
- an auth session panel for login, refresh, source switching, and sign-out
- note and transcript export actions backed by the same local API
- a recent export-jobs panel with rerun actions
- stronger empty and error states for list/detail failures
- a server-access panel that can unlock or lock a password-protected local server

### Attach

`attach` connects the terminal workspace to an already running `granola serve` or `granola web` instance instead of starting a second isolated app.

Use it when you want:

- two terminal workspaces attached to the same live app state
- one terminal workspace and one browser workspace sharing auth, meeting index, and export-job history
- a password-protected local server to remain the single source of truth

The attach flow uses the existing local HTTP API plus `GET /events` for live state updates.

### Runtime Boundaries

The toolkit now keeps its local persistence and transport contracts explicit:

- one shared local data directory for export jobs, meeting index data, and any file-backed session state
- one versioned local HTTP transport contract, exposed by `GET /server/info`
- one remote client handshake that validates the transport protocol before attaching

That keeps the current single-package repo simple, while making a future split into separate server/client packages or remote-hosted clients much less invasive.

### TUI

`tui` starts a full-screen terminal workspace on the shared app core, without requiring the local server or browser client. Use `attach` when you want the same workspace against an existing shared server instance instead.

The initial terminal workspace includes:

- a folder scope inside the navigation pane, including an explicit All meetings view
- a meeting list pane with keyboard navigation
- a detail pane with notes, transcript, metadata, and raw views
- an auth session overlay for import, refresh, source switching, and sign-out
- a footer with app state and key hints
- a quick-open overlay for jumping by title, id, or tag

The main keyboard controls are:

- `h` / `l`, left / right, or `Tab` to switch between folders and meetings
- `j` / `k` or arrow keys to move within the active folder or meeting list
- `/` or `Ctrl+P` to open quick open
- `a` to open auth session actions
- `1`-`4` to switch detail tabs
- `PageUp` / `PageDown` to scroll the detail pane
- `r` to refresh from live Granola data
- `q` to quit

### Local Meeting Index

Interactive meeting browsing now keeps a local index of meeting summaries and metadata.

That index is used to:

- make the web meeting list available quickly on startup
- keep search, sort, and date filtering useful before every live document payload is fetched again
- refresh itself after successful live loads so the next run starts warm

The web client uses the index as a fast path and upgrades to live data automatically when the background refresh completes. The manual Refresh button bypasses the index and forces a live meeting fetch immediately.

### Export Jobs

Exports are now tracked as jobs with:

- persistent local history across CLI and web runs
- running, completed, and failed status
- per-export progress counters
- rerun support from `granola exports rerun <job-id>` or the web client

Use `granola exports list` to inspect recent jobs from the CLI.

## Auth

If you do not want to keep passing `--supabase`, import the desktop app session once:

```bash
granola auth login
granola auth status
granola auth refresh
granola auth use stored
granola auth use supabase
```

That stores a reusable Granola session locally and lets `granola notes` use it directly.

`granola auth` now supports:

- `login` to import the desktop app session into the toolkit store
- `status` to inspect the active source, stored-session availability, refresh support, and any last auth error
- `refresh` to refresh the stored session explicitly
- `use stored` or `use supabase` to switch the active auth source
- `logout` to delete the stored session

The same auth actions are also available from the web workspace.

### Incremental Writes

Both commands keep a small hidden state file in the output directory to track:

- document id to filename
- content hash
- source timestamp
- last export time

That state is used to:

- keep filenames stable even if a meeting title changes later
- skip rewrites when the rendered content is unchanged
- migrate old files cleanly when the output format changes
- delete stale exports when a document disappears from the source data

That makes repeated runs cheap and keeps long-lived export directories much cleaner.

## Config

The CLI reads configuration in this order:

1. command-line flags
2. environment variables
3. `.granola.toml`
4. platform defaults

Supported config keys:

```toml
debug = true
supabase = "/Users/yourname/Library/Application Support/Granola/supabase.json"
output = "./notes"
timeout = "2m"
cache-file = "/Users/yourname/Library/Application Support/Granola/cache-v3.json"
transcript-output = "./transcripts"
```

Supported environment variables:

- `DEBUG_MODE`
- `SUPABASE_FILE`
- `OUTPUT`
- `TIMEOUT`
- `CACHE_FILE`
- `TRANSCRIPT_OUTPUT`
- `GRANOLA_CLIENT_VERSION`

## Development Checks

Before pushing changes, run:

```bash
vp check
vp test
vp pack
npm pack --dry-run
```

What those do:

- `vp check`: formatting, linting, and type checks
- `vp test`: unit tests
- `vp pack`: builds the CLI bundle into `dist/cli.js`
- `npm pack --dry-run`: shows the exact npm package contents without publishing

`vp build` is for web apps. This repo is a CLI package, so the build step here is `vp pack`.
