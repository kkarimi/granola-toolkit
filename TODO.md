# Gran Finish TODO

North star: finish `Gran` as a simple, local-first Granola source app. Keep `Yazd` future-facing in docs and architecture notes, but stop requiring progress in both repos at the same time.

## Product Direction

- `Gran` owns Granola auth, sync, local indexing, browsing, and practical local publishing.
- `Gran` should feel complete and understandable on its own:
  - connect
  - import
  - browse and search locally
  - publish to folders or Obsidian
  - expose clean machine-readable seams for external tools
- `Gran` should not keep growing as a generic automation product.
- `Yazd` remains the future workflow/review/publish layer, but for now Gran should only:
  - expose stable source data
  - expose generic events/hooks/fetch
  - mention Yazd as an optional consumer, not a co-equal runtime

## Guardrails

- Prefer deleting, demoting, or hiding complexity over adding more settings and concepts.
- Do not remove durable local-first capabilities that already work.
- Keep `main` working after every slice: full QA, commit, push.
- Treat docs, onboarding, and settings copy as product work, not polish.
- Do not require parallel Yazd work unless Gran is blocked on it.

| Priority | Status  | Size | Published In | Area                     | Task                                                                                                                                                      | Why                                                                 |
| -------- | ------- | ---- | ------------ | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| P1       | Done    | M    |              | Docs / Product Story     | Rewrite the roadmap, overview, nav, and getting-started flow around one Gran-first story: local workspace, local publishing, advanced integrations later. | Users still see too much automation/product-overlap language.       |
| P1       | Done    | M    |              | Web / Settings Simplify  | Reduce Settings to connection, knowledge bases, and advanced; demote automation-heavy surfaces.                                                           | Settings still exposes too much implementation and automation debt. |
| P1       | Done    | L    |              | Architecture / Core Trim | Split or shrink the biggest Gran pressure points: `core`, `automation-service`, and browser state glue.                                                   | Big files are the main drag on clarity and future changes.          |
| P2       | Pending | M    |              | Web / Hooks UI           | Add a lightweight UI for event hooks only after the product story is simpler.                                                                             | Hooks are useful, but not if they land in an already-bloated UI.    |
| P2       | Done    | M    |              | Review / Advanced        | Move review/automation workflows toward an explicitly advanced surface in Gran.                                                                           | Review exists, but should not dominate the core Gran story.         |
| P2       | Pending | S    |              | Docs / Yazd Handoff      | Keep one short architecture note showing what stays in Gran and what later belongs in Yazd.                                                               | Keep direction clear without forcing live dual-repo progress.       |
| P3       | Pending | M    |              | Integrations / Events+   | Expand events beyond sync when it clearly improves external automation.                                                                                   | Richer eventing can wait until Gran is simpler to understand.       |

## Recommended Build Order

1. product story and roadmap cleanup
2. settings simplification
3. docs simplification
4. core file shrink pass
5. optional hooks UI
6. deferred Yazd handoff details
