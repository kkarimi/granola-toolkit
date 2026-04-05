# V1 Launch TODO

Previous completed roadmap: `V1-RELEASE-TODO.md`.

North star: make `granola-toolkit` feel like a calm, service-backed product that a real user can install, connect, and trust on day one. The remaining v1 gap is not raw capability; it is whether the durable background runtime, guided setup, and browser UX actually feel coherent under first-run use.

## V1 Launch Guardrails

- Treat the reusable background service as the default local runtime, not a side path.
- Keep onboarding focused on the shortest route to value: API key, import, AI choice, starter pipeline.
- Avoid adding more panels before the default browser flow is calm enough to explain itself.
- Surface service and sync state explicitly so the user understands what keeps running.
- Add browser E2E coverage for the real first-run flow before calling the UX “v1 ready”.
- Batch this redesign on `main` without cutting new releases until the web UX is coherent enough to ship again.

| Priority | Status  | Size | Published In | Area                                    | Task                                                                                                                                                   | Why                                                                                                   |
| -------- | ------- | ---- | ------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| P1       | Done    | M    | 0.66.0       | Runtime / Service-First Web             | Make `granola web` attach to or start the reusable background service by default, with a clear foreground/debug escape hatch.                          | The default browser path should warm the local sync engine instead of creating another throwaway run. |
| P1       | Done    | M    | 0.66.0       | Web / Guided Setup V2                   | Refocus the onboarding flow into a cleaner three-step setup with explicit service context, better copy, and clearer next actions.                      | The current setup technically exists, but it still feels noisy and accidental in real use.            |
| P1       | Done    | M    | 0.66.0       | Testing / Service-Backed Onboarding E2E | Add or upgrade browser coverage for the actual happy path: launch, connect with an API key, sync/import, choose an agent, create the starter pipeline. | V1 confidence needs a real user journey, not just component checks and partial browser assertions.    |
| P1       | Done    | L    |              | Web / Home Dashboard                    | Replace the current default workspace with a calm home view that surfaces sync health, review backlog, recent meetings, folders, and clear next steps. | Users should land in one coherent home view instead of a dense wall of controls.                      |
| P1       | Done    | L    |              | Navigation / Folder-First Browse        | Stop dumping every meeting in the sidebar by default; make folder, recent, saved-filter, and search results the primary browse paths.                  | No one with hundreds of meetings should navigate from one giant undifferentiated list.                |
| P1       | Done    | M    |              | Meetings / Clear Context Header         | Lead the meeting view with the selected meeting title, date, folders, tags, and a clear selected-state header before notes/transcript content.         | The current meeting pane feels empty and ambiguous because it does not say what is actually selected. |
| P1       | Done    | M    |              | Status / Human Language                 | Replace implementation-heavy labels like cache, index, surface, and view with user-facing sync, connection, and review status copy.                    | Debug terminology does not help normal users understand what the app is doing.                        |
| P2       | Done    | M    |              | Search / Advanced Quick Open            | Demote “open by meeting id” into advanced search or command palette behaviour instead of promoting it in the main sidebar.                             | Opening by raw id is a niche power-user action, not primary navigation.                               |
| P2       | Done    | M    |              | Diagnostics / Advanced Details          | Move raw runtime and debugging details into a separate diagnostics/settings surface instead of the top-level workspace header.                         | The app needs a clean product UI without losing operator/debug access when needed.                    |
| P2       | Pending | M    |              | Sync / Health + Recovery                | Improve sync health language, cadence visibility, stale-state warnings, and recovery suggestions in the browser and CLI.                               | A background process only builds trust if users can tell whether it is healthy.                       |
| P2       | Pending | M    |              | Auth / Provider Setup Polish            | Tighten API-key and AI-provider setup copy, missing-key detection, and fallback guidance for OpenRouter, OpenAI, Codex, and desktop import.            | First-run setup still leaks too much implementation detail into the UI.                               |

Status note:
The browser is materially calmer now, but it is still not ready to release. The remaining gaps are sync health/recovery and cleaner auth/provider setup, after which we can reassess whether the web experience is coherent enough for the next release batch.
