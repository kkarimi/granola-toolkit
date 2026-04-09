# UX Simplification And PKM TODO

North star: make Gran feel calm and obvious to use, while still becoming a local-first meeting automation layer for Personal Knowledge Management systems with Pi/OpenClaw support as an ecosystem integration instead of a runtime rewrite.

## Product Direction

- Publish reliable meeting artifacts into PKM systems, not just export raw notes/transcripts.
- Prefer user jobs over internal system concepts in the main UI.
- Treat markdown vaults as the first-class target; layer Obsidian polish on top.
- Keep review-before-publish as a core product flow.
- Support Pi/OpenClaw through a package and optional agent runtime plugin, not by rebuilding Gran around Pi.

## Guardrails

- Keep the first PKM target filesystem-first and idempotent.
- Keep Home, Search, Review, and Settings focused on one primary job each.
- Do not hardwire one PKM vendor into the core model.
- Do not make Pi a required dependency for Gran.
- Keep `main` shippable after each slice: full QA, commit, and push. Hold releases until the batch feels coherent.

| Priority | Status      | Size | Published In | Area                   | Task                                                                                                                                | Why                                                                  |
| -------- | ----------- | ---- | ------------ | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| P1       | Done        | M    |              | UX / Home              | Simplify Home into latest meetings, last sync, needs attention, folders, and recent context instead of a local-state control panel. | Home should answer what changed and what to open next.               |
| P1       | Done        | M    |              | UX / Search            | Make Search query-first by hiding sort/date/exact-open behind an optional refine panel.                                             | Search should feel like search, not like an operator filter sheet.   |
| P1       | Done        | M    |              | UX / Settings          | Reframe Settings around Connection, Publishing, Automation, and Advanced instead of raw implementation sections.                    | Users think in jobs, not internal subsystem names.                   |
| P1       | Done        | M    |              | UX / Review            | Rename and reshape Review around human decisions like Needs Recovery, Needs Approval, and Ready To Publish.                         | Review still exposes pipeline nouns instead of user tasks.           |
| P2       | Pending     | S    |              | UX / Onboarding        | End first-run onboarding after connect + import, with automation as a secondary next step.                                          | Users should reach value before they have to choose an agent.        |
| P2       | Pending     | M    |              | UX / TUI               | Simplify TUI browsing so folders, recent items, and meetings do not compete in one pane.                                            | The TUI currently asks users to parse too many browse modes at once. |
| P1       | Done        | M    |              | PKM / Artifact Model   | Define a canonical PKM artifact model for meeting notes, transcripts, decisions, action items, entities, and provenance.            | Every target and review flow needs one stable output contract.       |
| P1       | Done        | M    |              | PKM / Target Contract  | Define the PKM target plugin contract for filesystem vaults, API targets, review mode, and idempotent publish identity.             | We need clean target boundaries before adding more destinations.     |
| P1       | Done        | L    |              | PKM / Markdown Vault   | Build a first-class generic markdown vault target with stable paths, linked artifacts, and rerun-safe publishing.                   | This gives the broadest immediate value across PKM tools.            |
| P1       | Done        | M    |              | PKM / Obsidian Polish  | Add Obsidian-specific support: daily notes, open-in-Obsidian actions, URI helpers, and vault conventions.                           | Obsidian is the highest-value PKM target after generic vaults.       |
| P1       | Done        | L    |              | PKM / Review Workspace | Design and implement a review-before-publish workflow with previews, target selection, approve/reject/retry, and provenance.        | PKM publishing needs trust and human review before writes.           |
| P1       | In Progress | M    |              | Pi / Strategy          | Lock the Gran x Pi integration strategy and build a first Pi package prototype with skills, prompts, and command recipes.           | Pi/OpenClaw should be supported as an ecosystem, not by assumption.  |
| P2       | Pending     | M    |              | Intelligence / Presets | Add PKM-oriented intelligence presets for decisions, action items, people, companies, and daily-note summaries.                     | PKM workflows want structured outputs, not just archived notes.      |
| P2       | Pending     | M    |              | PKM / Notion           | Design and implement a Notion target plugin for page/database publishing.                                                           | Notion is the largest API-driven PKM target.                         |
| P2       | Pending     | M    |              | PKM / Capacities       | Design and implement a Capacities target plugin.                                                                                    | Capacities is promising, but still second-wave behind vaults.        |
| P2       | Pending     | M    |              | PKM / Tana             | Build a Tana structured-output plugin aimed at supertags/nodes rather than full-archive mirroring.                                  | Tana is better for structured intelligence than raw archive sync.    |
| P2       | Pending     | M    |              | Publish / Reliability  | Add per-target idempotency checks, repair flows, drift detection, publish logs, and retry behavior.                                 | Multi-target PKM publishing will need stronger operational trust.    |
| P3       | Pending     | M    |              | PKM / Anytype          | Explore and prototype an Anytype target plugin.                                                                                     | Promising local-first fit, but lower priority than vaults/Notion.    |
| P3       | Pending     | S    |              | PKM / Logseq           | Add Logseq-specific polish beyond generic markdown vault support.                                                                   | Generic vault support should cover most needs first.                 |
| P3       | Pending     | M    |              | Docs / Positioning     | Rework docs and onboarding around Gran as PKM automation, with examples for Obsidian, review-first publishing, and Pi/OpenClaw.     | The product story should match the roadmap.                          |

## Recommended Build Order

1. PKM artifact model
2. PKM target contract
3. markdown vault target
4. Obsidian polish
5. review-before-publish workspace
6. Pi package
7. PKM intelligence presets
8. Notion / Capacities / Tana plugins
