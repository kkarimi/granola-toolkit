# Gran Vision

`Gran` is not the automation product.

It should be the best local runtime and source workspace for Granola:

- connect to Granola
- sync meetings locally
- expose reliable machine-readable source data
- provide practical local browsing, search, and source-adjacent publishing

## Ownership

Gran owns:

- Granola auth and session handling
- local sync, indexing, caching, and transcript access
- browser/TUI/CLI source workspace
- universal local integration seams:
  - events
  - machine-readable fetch
  - script and webhook hooks

Gran should not become the place where source-agnostic workflow and PKM automation concepts are invented.

That belongs in `Yazd`.

## Relationship With Yazd

`Yazd` is the user-facing knowledge automation layer.

It should own:

- workflow definitions
- review and approval UX
- agent integrations
- publish planning
- multi-destination knowledge-base plugins

Gran should expose a stable local source contract that Yazd can consume.

## Practical Rule

When adding a new feature, ask:

1. Is this about talking to Granola or exposing Granola data locally?
   - If yes, it belongs in Gran.
2. Is this about generic workflows, review, publishing, or agent orchestration?
   - If yes, it belongs in Yazd.
