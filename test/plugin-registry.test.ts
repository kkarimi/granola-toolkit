import { describe, expect, test } from "vite-plus/test";

import {
  applyPluginRuntimeDefaults,
  defaultPluginDefinitions,
  resolvePluginConfiguredEnablement,
} from "../src/plugin-registry.ts";

describe("plugin registry helpers", () => {
  test("resolve configured enablement from generic registry metadata", () => {
    const resolved = resolvePluginConfiguredEnablement({
      configValues: {
        "markdown-viewer-plugin-enabled": false,
      },
      definitions: defaultPluginDefinitions(),
      env: {
        GRANOLA_AUTOMATION_PLUGIN_ENABLED: "true",
      },
      envFlag: (value) => {
        if (value === "true") {
          return true;
        }
        if (value === "false") {
          return false;
        }
        return undefined;
      },
      persistedEnabled: {
        automation: false,
        "markdown-viewer": true,
      },
      pickBoolean: (value) => (typeof value === "boolean" ? value : undefined),
    });

    expect(resolved).toEqual({
      enabled: {
        automation: true,
        "markdown-viewer": false,
      },
      sources: {
        automation: "env",
        "markdown-viewer": "config",
      },
    });
  });

  test("apply runtime defaults only when a plugin still uses its default source", () => {
    const definitions = defaultPluginDefinitions();

    expect(
      applyPluginRuntimeDefaults({
        definitions,
        enabled: {
          automation: false,
          "markdown-viewer": true,
        },
        signals: {
          automationRuntimeAvailable: true,
        },
        sources: {
          automation: "default",
          "markdown-viewer": "persisted",
        },
      }),
    ).toEqual({
      enabled: {
        automation: true,
        "markdown-viewer": true,
      },
      sources: {
        automation: "runtime",
        "markdown-viewer": "persisted",
      },
    });
  });

  test("declare follow-up settings contributions in the registry", () => {
    const automation = defaultPluginDefinitions().find(
      (definition) => definition.id === "automation",
    );

    expect(automation?.settingsContributions).toEqual([
      {
        capability: "automation",
        id: "automation-harness-editor",
        section: "plugins",
      },
      {
        capability: "automation",
        id: "automation-review-diagnostics",
        section: "diagnostics",
      },
    ]);
  });
});
