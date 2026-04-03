import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import { MemorySessionStore } from "../src/client/auth.ts";
import { runCli } from "../src/cli.ts";
import * as authModule from "../src/client/auth.ts";

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

  test("shows transcripts help from the command module", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const exitCode = await runCli(["transcripts", "--help"]);

    expect(exitCode).toBe(0);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Granola transcripts"));
    expect(error).not.toHaveBeenCalled();
  });

  test("shows auth help from the command module", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const exitCode = await runCli(["auth", "--help"]);

    expect(exitCode).toBe(0);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Granola auth"));
    expect(error).not.toHaveBeenCalled();
  });

  test("shows meeting help from the command module", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const exitCode = await runCli(["meeting", "--help"]);

    expect(exitCode).toBe(0);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Granola meeting"));
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

  test("surfaces a clean error for a missing supabase file", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(authModule, "createDefaultSessionStore").mockReturnValue(new MemorySessionStore());

    const exitCode = await runCli(["notes", "--supabase", "/tmp/granola-missing-supabase.json"]);

    expect(exitCode).toBe(1);
    expect(log).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      "supabase.json not found: /tmp/granola-missing-supabase.json",
    );
  });

  test("surfaces a clean error for a missing cache file", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const exitCode = await runCli(["transcripts", "--cache", "/tmp/granola-missing-cache.json"]);

    expect(exitCode).toBe(1);
    expect(log).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      "Granola cache file not found: /tmp/granola-missing-cache.json",
    );
  });
});
