# granola-toolkit

General toolkit to do more with Granola notes and transcripts.

## Install

From npm:

```bash
npm install -g granola-toolkit
granola --help
```

Without a global install:

```bash
npx granola-toolkit --help
```

For local development:

```bash
curl -fsSL https://vite.plus | bash
vp help
vp install
```

## Run

Installed CLI:

```bash
granola --help
granola auth login
granola meeting --help
granola notes --help
granola transcripts --help
```

Local build:

```bash
vp pack
node dist/cli.js --help
node dist/cli.js meeting --help
node dist/cli.js notes --help
node dist/cli.js transcripts --help
```

You can also use the package scripts:

```bash
npm run build
npm run start -- meeting --help
npm run notes -- --help
npm run transcripts -- --help
```

## Examples

Export notes:

```bash
granola auth login
granola notes

node dist/cli.js notes --supabase "$HOME/Library/Application Support/Granola/supabase.json"
node dist/cli.js notes --format json --output ./notes-json
```

Export transcripts:

```bash
node dist/cli.js transcripts --cache "$HOME/Library/Application Support/Granola/cache-v3.json"
node dist/cli.js transcripts --format yaml --output ./transcripts-yaml
```

Inspect individual meetings:

```bash
granola meeting list --limit 10
granola meeting list --search planning
granola meeting view 1234abcd
granola meeting export 1234abcd --format yaml
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
5. render either a list, a human-readable meeting view, or a machine-readable export bundle

The human-readable `view` command shows:

- meeting metadata
- the selected notes content
- transcript lines when the local cache is available

The machine-readable `export` command includes:

- a meeting summary
- structured note data plus rendered Markdown
- structured transcript data plus rendered transcript text when available

## Auth

If you do not want to keep passing `--supabase`, import the desktop app session once:

```bash
granola auth login
granola auth status
```

That stores a reusable Granola session locally and lets `granola notes` use it directly. `granola auth logout` deletes the stored session.

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
