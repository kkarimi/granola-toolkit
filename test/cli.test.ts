import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import { runCli } from "../src/cli.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runCli", () => {
  test("shows root help when asked explicitly", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const exitCode = await runCli(["--help"]);

    expect(exitCode).toBe(0);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Granola CLI"));
    expect(error).not.toHaveBeenCalled();
  });

  test("shows notes help from the command module", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const exitCode = await runCli(["notes", "--help"]);

    expect(exitCode).toBe(0);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Granola notes"));
    expect(error).not.toHaveBeenCalled();
  });

  test("returns an error when no command is provided", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const exitCode = await runCli([]);

    expect(exitCode).toBe(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Commands:"));
    expect(error).not.toHaveBeenCalled();
  });
});
