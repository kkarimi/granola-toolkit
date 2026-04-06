# Architecture Simplification TODO

Older release-roadmap files have been retired; this is the only active TODO.

North star: make `granola-toolkit` easier to reason about than it is to accidentally grow. The immediate goal is not new surface area; it is to reduce orchestration duplication, give meetings/folders/sync one canonical read model, and make future web, TUI, automation, and extension work land on cleaner boundaries.

## Refactor Guardrails

- Prefer bounded slices that reduce coupling without changing product behaviour.
- Keep `main` shippable after every step: full QA, commit, and push, but no batched release yet.
- Move orchestration toward services and controllers before introducing plugin abstractions.
- Keep domain state separate from web/TUI view state; app core should not decide page or tab behaviour.
- Centralise derived meeting semantics so transcript availability, summary signals, and search metadata cannot drift.
- Favour registries and capability interfaces over framework-specific extension hooks.

| Priority | Status | Size | Published In | Area                                     | Task                                                                                                                                    | Why                                                                                             |
| -------- | ------ | ---- | ------------ | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| P1       | Done   | L    |              | Architecture / Core Service Split        | Split `GranolaApp` into composed services for auth/session, sync, catalog, automation, and exports while keeping one top-level app API. | The current core is a god object and makes every new feature pay a coupling tax.                |
| P1       | Done   | M    |              | Architecture / Catalog Read Service      | Extract document, cache, folder, and meeting-bundle loading into a dedicated catalog service under `src/app/catalog.ts`.                | Read-side loading is a clean seam and removes a large chunk of orchestration from `core.ts`.    |
| P1       | Done   | L    |              | Domain / Canonical Meeting Model         | Centralise meeting, transcript, folder, and search projections into one read-model layer that every surface and index depends on.       | Transcript/search/sync semantics are duplicated today and already caused real user bugs.        |
| P1       | Done   | L    |              | Web / Page Controllers                   | Split the Solid web shell into per-page controllers or stores plus one shared session/server controller.                                | `App.tsx` is acting like a second app core and is too large to change safely.                   |
| P2       | Done   | M    |              | CLI / Shared Command Bootstrap           | Centralise `loadConfig` + `createGranolaApp` + common debug logging in command helpers, then migrate the most repetitive commands.      | This is the smallest high-leverage slice and reduces repeated orchestration immediately.        |
| P2       | Done   | M    |              | Core / Surface State Separation          | Remove page, selection, and tab decisions from domain methods so web and TUI own view state themselves.                                 | Plugins and new surfaces should not inherit hidden browser/TUI assumptions from app logic.      |
| P2       | Done   | M    |              | Types / Lean Boundaries                  | Replace bundle-heavy transport types with stable domain entities plus explicit projections where needed.                                | Current bundle types mix raw API/cache payloads with rendered models and make reuse awkward.    |
| P3       | Done   | M    |              | Extension / Provider Registries          | Add registries for agent providers, automation actions, exporters, and future import/sync adapters.                                     | We need extension seams before we can cleanly support more platforms or third-party modules.    |
| P3       | Done   | S    |              | Docs / Architecture Notes                | Write concise architecture notes for service boundaries, read models, and extension seams once the first refactors land.                | Refactors only stick if the next contributor can tell which boundary is intentional.            |
| P1       | Done   | L    |              | Architecture / Automation Review Service | Move automation rules, runs, artefacts, evaluations, approvals, and processing recovery behind a dedicated app service.                 | This is still the largest orchestration block left in `core.ts` and the most obvious next seam. |
| P1       | Done   | L    |              | Web / Browser Controller Hooks           | Split the Solid app runtime into narrower hooks or controllers for server/auth, browse, review, and harness flows.                      | `App.tsx` still acts like a giant browser runtime and makes every page flow touch one file.     |
| P2       | Done   | M    |              | Server / HTTP Route Modules              | Break the local HTTP server into route modules for auth, meetings, automation, exports, and web assets.                                 | `startGranolaServer()` is still a full router in one function and hard to extend safely.        |
| P2       | Done   | M    |              | Web / Component Domain Split             | Split `components.tsx` into meeting, review, settings, and home/search component groups.                                                | The component surface is still one warehouse file, which hides page boundaries.                 |
| P2       | Done   | M    |              | TUI / Workspace Controller Split         | Separate TUI data/control logic from rendering so the workspace is easier to extend and reason about.                                   | `workspace.ts` still mixes loading, input handling, overlays, and rendering in one class.       |

Status note:
This roadmap starts with internal simplification, not a visible product release. Work should land in small slices on `main`, stay fully QA’d, and preserve user-facing behaviour while we make future features easier to add.
