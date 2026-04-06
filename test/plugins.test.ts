import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vite-plus/test";

import { FilePluginSettingsStore, MemoryPluginSettingsStore } from "../src/plugins.ts";

describe("plugin settings stores", () => {
  test("default to automation disabled in memory", async () => {
    const store = new MemoryPluginSettingsStore();

    await expect(store.readSettings()).resolves.toEqual({
      automationEnabled: false,
    });
  });

  test("persist automation enabled state to disk", async () => {
    const directory = await mkdtemp(join(tmpdir(), "granola-plugin-settings-"));
    const filePath = join(directory, "plugins.json");
    const store = new FilePluginSettingsStore(filePath);

    await store.writeSettings({
      automationEnabled: true,
    });

    await expect(store.readSettings()).resolves.toEqual({
      automationEnabled: true,
    });
  });
});
