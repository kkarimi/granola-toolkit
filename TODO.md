# Gran x Yazd Integration TODO

North star: keep `Gran` focused on being the best Granola source app and local workspace while integrating it cleanly with `Yazd`, the source-agnostic local-first knowledge automation product now living at `github.com/kkarimi/yazd`.

## Product Direction

- `Yazd` is the generic automation and publishing system.
- `Gran` stays the dedicated Granola app, source adapter, and local workspace.
- Gran automation should move toward plugin boundaries instead of growing deeper inside the Gran app core.
- Knowledge bases, review, and agent execution belong to `Yazd` over time.
- Keep the integration seams small, typed, and shippable.

## Guardrails

- Do not rename user-facing Gran features to Yazd prematurely.
- Keep `main` working after every slice: full QA, commit, and push. Hold releases until the extraction batch feels coherent.
- Prefer contract and package seams before moving behavior.
- Keep Gran usable even if Yazd packages are not installed yet.

| Priority | Status      | Size | Published In | Area                  | Task                                                                                                        | Why                                                               |
| -------- | ----------- | ---- | ------------ | --------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| P1       | Done        | S    |              | Yazd / Strategy       | Lock the brand and architecture direction: Yazd as PKM automation core, Gran as a source app/plugin.        | The split should be intentional before code starts moving.        |
| P1       | Done        | M    |              | Yazd / Repo Seed      | Create `github.com/kkarimi/yazd` and move the first `@kkarimi/yazd-core` contract package there.            | The boundary should be real, not just a workspace fiction.        |
| P1       | Done        | M    |              | Gran / Source Seam    | Define how Gran surfaces meetings, transcripts, and sync events as a Yazd source plugin boundary.           | Gran should become one source, not the whole automation platform. |
| P1       | Done        | M    |              | Gran / KB Plugin Seam | Move markdown vault and Obsidian-facing publish behavior behind Yazd knowledge-base plugin interfaces.      | Publishing should become source-agnostic.                         |
| P1       | In Progress | M    |              | SDK / Real Boundaries | Make the SDK depend on real external packages instead of re-exporting root source directly.                 | The SDK is not a real package boundary yet.                       |
| P1       | Pending     | M    |              | Gran / App Boundary   | Reduce Gran’s built-in automation ownership so it consumes Yazd-style contracts rather than inventing more. | This keeps Gran from staying the god-product forever.             |
| P2       | Pending     | M    |              | Yazd / Review Core    | Integrate Gran with Yazd review and publish decision models once they stabilize in the Yazd repo.           | Review is central to the generic product.                         |
| P2       | Pending     | M    |              | Yazd / Pi Plugin      | Integrate Gran with a future Pi/OpenClaw agent plugin package built on the Yazd agent contract.             | Pi support fits better as a Yazd ecosystem package.               |
| P2       | Pending     | M    |              | Yazd / KB Plugins     | Integrate second-wave knowledge-base plugins such as Notion, Capacities, or Tana via Yazd contracts.        | These should build on the generic KB seam, not custom Gran logic. |
| P3       | Pending     | M    |              | Docs / Product Story  | Reframe docs once the integration behavior actually moves: Gran as source app, Yazd as PKM automation.      | The public story should match the implementation, not get ahead.  |

## Recommended Build Order

1. Gran source seam
2. knowledge-base plugin seam
3. SDK real package boundaries
4. Gran app boundary cleanup
5. review core integration
6. Pi/OpenClaw plugin integration
7. second-wave knowledge-base plugins
