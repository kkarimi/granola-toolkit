# Sync Transparency TODO

North star: users should always understand whether they are looking at live Granola data or local toolkit state, when sync last ran, what auth path is active, and where the relevant local files live.

## Guardrails

- Prefer user language like `local index`, `local snapshot`, `last synced`, and `transcripts on demand` over vague `cache` wording.
- Keep the main workspace calm: lightweight trust signals on Home and contextual freshness labels in browse/meeting views, with deeper details in Settings.
- Reuse the same source of truth everywhere. Home, Diagnostics, and any future sync activity page should derive from one shared sync/runtime state model.
- Keep `main` shippable after each slice: full QA, commit, and push, but no release cut yet.

| Priority | Status  | Size | Published In | Area                      | Task                                                                                                                | Why                                                                                 |
| -------- | ------- | ---- | ------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| P1       | Done    | M    |              | Sync / Trust Layer        | Add a compact Home summary for sync, auth path, local index, transcript source, and active local config.            | Users need to know what they are looking at without digging through diagnostics.    |
| P1       | Done    | M    |              | Diagnostics / Local Paths | Expose real local file locations and sync details in Settings, including config, index, snapshot, sync, and cache.  | Transparency should include the actual files on disk, not just booleans and badges. |
| P1       | Done    | M    |              | Browse / Freshness Labels | Show contextual labels when folders or meetings are coming from local snapshot/index fallback instead of live load. | The current UI still hides when data is inferred, stale, or locally reconstructed.  |
| P2       | Done    | M    |              | Sync / Activity History   | Add a sync activity surface with recent runs, change counts, failures, and last fallback/rate-limit events.         | Users need a place to answer “what changed?” and “what went wrong?” after a sync.   |
| P2       | Pending | S    |              | Vocabulary / Copy Cleanup | Replace remaining user-facing `cache` language with clearer `local index`, `local files`, or `transcripts` terms.   | The wrong vocabulary still makes the product feel unreliable and internal.          |
| P2       | Pending | S    |              | Context / Meeting Loading | Show per-meeting freshness hints like `transcript on demand` or `showing last synced folder membership`.            | Meeting pages still hide important data provenance once the page is loaded.         |
| P3       | Pending | S    |              | Docs / Local-first Model  | Document how sync, local files, auth fallbacks, and on-demand transcript loading actually work together.            | The docs should reinforce the same mental model as the product surfaces.            |
