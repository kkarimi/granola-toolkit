# Integrations And Export UX TODO

North star: make `granola-toolkit` feel like the open-source control plane for Granola, not just a pile of low-level commands.

## External Inspiration Worth Copying

- `obsidian-granola-sync`: opinionated export targets, PKM-friendly structure, and better “this lands in my notes system” ergonomics
- `granola-claude-plugin`: simple “extract intelligence from recent meetings” workflows, privacy-first local processing, and built-in useful outputs instead of generic AI knobs

## Guardrails

- Prefer one calm workflow over parallel one-off commands where possible.
- Reuse the existing local-first runtime, agent, review, and plugin systems instead of inventing sidecar tools.
- Keep new integrations target-based and registry-driven so we can support Obsidian, local folders, and future destinations without hardcoding per-app logic everywhere.
- Keep `main` shippable after each slice: full QA, commit, and push. Hold releases until the batch feels coherent.

| Priority | Status | Size | Published In | Area                         | Task                                                                                                                          | Why                                                                                      |
| -------- | ------ | ---- | ------------ | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| P1       | Done   | M    |              | Export / Unified Workflow    | Add `granola export` that exports notes and transcripts together by default, with sensible opt-outs and a shared output root. | Notes and transcripts should feel like one archive export, not two unrelated tools.      |
| P1       | Done   | L    |              | Export / Target Profiles     | Add named export targets/profiles so users can send one export bundle into local folders, vaults, or future app integrations. | This is the clean path toward Obsidian-style syncing without per-command path sprawl.    |
| P1       | Done   | L    |              | Intelligence / Presets       | Add built-in extraction presets for people, companies, action items, decisions, and insights over recent meetings.            | The AI value should start from useful outcomes, not from raw model configuration.        |
| P1       | Done   | M    |              | Review / Intelligence Inbox  | Let users review, approve, and save those extracted outputs from web/TUI before they land in files or downstream systems.     | This keeps AI features trustworthy and fits the existing review model.                   |
| P2       | Done   | L    |              | PKM / Obsidian-Friendly Sync | Add vault-oriented export shaping such as backlinks, daily-note placement, and cleaner note metadata for PKM use.             | This is the strongest concrete integration pattern from the Obsidian sync project.       |
| P2       | Done   | M    |              | Export / Web And TUI Surface | Replace separate “export notes” and “export transcripts” actions in web/TUI with one bundled export flow.                     | The UI should match the unified export model, not keep exposing the old split.           |
| P2       | Done   | M    |              | Intelligence / Recent Runs   | Add simple commands/pages for “last 5 meetings”, “last 7 days”, and similar scoped extraction runs.                           | The Claude-style plugin succeeds because the entry point is easy and outcome-focused.    |
| P3       | Done   | M    |              | Integrations / Registries    | Expose export targets and intelligence presets through contribution registries rather than hardcoded arrays in commands.      | This keeps future destinations elegant as the product grows without overloading plugins. |
