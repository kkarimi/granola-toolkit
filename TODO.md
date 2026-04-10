# Gran Integration Simplification TODO

North star: keep `Gran` focused on being the best local Granola source app. External automation should consume Gran through universal seams like events, machine-readable fetch commands, scripts, and webhooks instead of deep package coupling.

## Product Direction

- `Gran` owns Granola auth, sync, local indexing, browsing, and practical local publishing.
- External tools such as `Yazd` should treat Gran like any other local source.
- The main integration seams should be language-agnostic:
  - event stream
  - machine-readable CLI / HTTP fetch surfaces
  - script and webhook hooks
- Prefer universal local automation patterns before framework-specific contracts.

## Guardrails

- Do not remove existing capabilities just to make the architecture cleaner.
- Keep `main` working after every slice: full QA, commit, and push. Hold releases until the simplification batch feels coherent.
- Keep backward compatibility where it is cheap, but do not design around speculative legacy users.
- Gran should stay useful even if no external automation tool is installed.

| Priority | Status  | Size | Published In | Area                      | Task                                                                                                                   | Why                                                                   |
| -------- | ------- | ---- | ------------ | ------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| P1       | Done    | S    |              | Integrations / Event Flow | Promote `gran events` to a first-class command with followable machine-readable output.                                | External tools need one obvious event seam before anything fancier.   |
| P1       | Done    | M    |              | Integrations / Hooks      | Add generic script/webhook hooks for events like `meeting.updated` and `transcript.ready`.                             | A simple event runner is more universal than Yazd-shaped embedding.   |
| P1       | Pending | M    |              | Integrations / Fetch      | Document and tighten machine-readable fetch surfaces for meetings, folders, and transcripts.                           | Events are only useful if consumers can fetch the payloads they need. |
| P1       | Pending | M    |              | Architecture / Decouple   | Shrink or move Yazd-specific seams so Gran stops exporting package-specific automation contracts as the default story. | Gran should expose source seams, not become a second automation core. |
| P2       | Pending | M    |              | Docs / Integrations       | Add a docs page showing Gran as a universal local source for scripts, hooks, and external tools like Yazd.             | The public story should match the simpler architecture.               |
| P2       | Pending | M    |              | Web / Hooks UI            | Add a lightweight settings surface for inspecting and managing external event hooks.                                   | Hooks are more usable if people do not need to edit JSON by hand.     |
| P3       | Pending | M    |              | CLI / Event Sources       | Expand the event stream beyond sync history to include publish/review/export events where it makes sense.              | A richer event bus can come later once the seam is stable.            |

## Recommended Build Order

1. first-class event stream
2. script/webhook hooks
3. machine-readable fetch contract
4. docs + examples
5. reduce Yazd-specific coupling
6. optional hooks UI
