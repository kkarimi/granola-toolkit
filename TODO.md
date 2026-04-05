# V1 Release TODO

Previous completed roadmap: `V1-CANDIDATE-TODO.md`.

North star: make `granola-toolkit` feel like a trustworthy daily-use product, not just a powerful toolkit. The next release needs reliable background sync, API-key-first auth, a clean guided first-run flow, and release quality that matches the ambition of the automation layer.

## V1 Release Guardrails

- Keep the sync engine, event log, agent execution, and UI layers separate.
- Prefer one local service/runtime boundary over hidden per-command state rebuilds.
- Optimise first-run UX around Granola API keys; desktop session import and `supabase.json` stay as fallbacks.
- Keep the web app focused on progressive disclosure instead of showing every advanced panel at once.
- Add E2E tests for the happy path before calling the UX “good enough”.
- Keep shipping in small release slices with full QA and published versions recorded here.

| Priority | Status  | Size | Published In | Area                     | Task                                                                                                                                                                   | Why                                                                                                                             |
| -------- | ------- | ---- | ------------ | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| P1       | Done    | L    | 0.60.0       | Sync / Background Loop   | Add a long-running local sync/service mode that continuously refreshes meetings, transcripts, folders, and durable sync events instead of only rebuilding on demand.   | The toolkit needs a real background heartbeat before automation can feel dependable.                                            |
| P1       | Done    | M    | 0.59.0       | Web / Guided Onboarding  | Add a first-run web onboarding flow that connects Granola, runs the first sync/import, lets the user choose an AI provider, and seeds a usable starter pipeline.       | The current web surface is overwhelming, and new users should not need to understand harnesses and rules before they see value. |
| P1       | Done    | M    | 0.61.0       | Auth / API Keys First    | Make API keys the default recommended auth path across web, CLI, and TUI, with clearer status, copy, and fallbacks for stored sessions and `supabase.json`.            | Granola now exposes personal API keys, so the default UX should follow the most stable supported auth path.                     |
| P1       | Done    | M    | 0.59.0       | Testing / Onboarding E2E | Add an end-to-end browser scenario for first-run onboarding: enter API key, sync meetings, choose an agent/provider, and land in a clean workspace with starter state. | We need confidence in the exact setup path users will take, not just component-level tests.                                     |
| P2       | Pending | L    |              | Web / Workspace Cleanup  | Simplify the post-onboarding web workspace with progressive disclosure, cleaner panel hierarchy, and better defaults instead of the current all-panels-at-once layout. | Fixing onboarding alone is not enough if the landing workspace still feels noisy and hard to navigate.                          |
| P2       | Pending | M    |              | Releases / Notes         | Replace tag-only release hygiene with proper GitHub Releases, better notes, and a clearer published changelog for each npm release.                                    | A v1 release needs a credible release story, not just npm versions and Git tags.                                                |
| P2       | Pending | M    |              | Search / Full Text       | Add search across titles, folders, tags, notes, transcripts, and generated artefacts from the shared local index.                                                      | Once sync becomes continuous, “find the meeting where X was said” becomes one of the highest-value user workflows.              |
| P3       | Pending | M    |              | UX / Review Inbox        | Polish review, approval, and automation history into a single clearer inbox across web and TUI.                                                                        | The automation layer is strong, but the operator experience still needs to feel calmer and more intentional.                    |

Status note:
The toolkit has the core automation foundation. The next release block is productisation: background sync, clean onboarding, API-key-first auth, and a web UX that feels coherent under real first-run use.
