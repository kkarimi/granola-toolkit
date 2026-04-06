# Plugin Simplification TODO

North star: keep the shipped plugin layer generic enough that new plugins can be added from the registry without reopening core bootstrap code or web settings wiring.

## Refactor Guardrails

- Keep built-in plugins working while moving concrete ids and legacy keys deeper into the registry and compatibility layer.
- Prefer registry metadata and capability helpers over web-app maps or app-core conditionals.
- Keep plugin toggling safe for users: feature cleanup and reload paths must stay explicit even if the registry becomes more generic.
- Keep `main` shippable after every slice: full QA, commit, and push, but no release cut yet.

| Priority | Status | Size | Published In | Area                             | Task                                                                                                                            | Why                                                                                    |
| -------- | ------ | ---- | ------------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| P1       | Done   | M    |              | Plugins / Registry Metadata      | Move plugin status copy and compatibility metadata into the registry so the web settings UI can render from plugin state alone. | `App.tsx` should not own a hardcoded detail map for each shipped plugin.               |
| P1       | Done   | M    |              | Plugins / Compatibility Defaults | Resolve env/config/persisted/runtime plugin enablement from registry definitions instead of hardcoding automation defaults.     | `config.ts`, `plugins.ts`, and `core.ts` should not need direct knowledge of ids.      |
| P2       | Done   | M    |              | Plugins / Web Lifecycle Hooks    | Move plugin enable/disable side effects out of `App.tsx` into capability-aware helpers.                                         | The browser still owns too much plugin-specific cleanup and reload behaviour.          |
| P2       | Done   | L    |              | Plugins / Settings Contributions | Let plugins describe follow-up settings surfaces or sections instead of hardcoding automation panels after the plugins list.    | Settings should become extensible without teaching page controllers about each plugin. |
| P3       | Done   | S    |              | Docs / Registry Notes            | Update the architecture notes so registry metadata, compatibility keys, and runtime defaults are documented together.           | The next slice should build on one stated boundary instead of rediscovering it again.  |
