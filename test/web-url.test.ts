import { describe, expect, test } from "vite-plus/test";

import { buildGranolaMeetingUrl } from "../src/web-url.ts";

describe("buildGranolaMeetingUrl", () => {
  test("adds the selected meeting id to the browser URL", () => {
    const url = buildGranolaMeetingUrl(new URL("http://127.0.0.1:4096/"), "doc-alpha-1111");

    expect(url.href).toBe("http://127.0.0.1:4096/?meeting=doc-alpha-1111");
  });

  test("leaves the base URL unchanged for blank meeting ids", () => {
    const url = buildGranolaMeetingUrl(new URL("http://127.0.0.1:4096/?tab=notes"), "   ");

    expect(url.href).toBe("http://127.0.0.1:4096/?tab=notes");
  });
});
