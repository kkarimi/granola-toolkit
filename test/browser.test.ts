import { describe, expect, test, vi } from "vite-plus/test";

import { getBrowserOpenCommand, openExternalUrl } from "../src/browser.ts";

describe("getBrowserOpenCommand", () => {
  test("uses open on macOS", () => {
    expect(getBrowserOpenCommand("http://127.0.0.1:4111", "darwin")).toEqual({
      args: ["http://127.0.0.1:4111"],
      file: "open",
    });
  });

  test("uses cmd start on Windows", () => {
    expect(getBrowserOpenCommand("http://127.0.0.1:4111", "win32")).toEqual({
      args: ["/c", "start", "", "http://127.0.0.1:4111"],
      file: "cmd",
    });
  });
});

describe("openExternalUrl", () => {
  test("delegates to the configured runner", async () => {
    const run = vi.fn(async () => {});

    await openExternalUrl("http://127.0.0.1:4111", {
      platform: "linux",
      run,
    });

    expect(run).toHaveBeenCalledWith("xdg-open", ["http://127.0.0.1:4111"]);
  });
});
