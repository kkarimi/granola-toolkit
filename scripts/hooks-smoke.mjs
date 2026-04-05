#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const tempDir = mkdtempSync(join(tmpdir(), "granola-hook-smoke-"));
let cleanupNeeded = false;

function run(command, args, cwd = root, options = {}) {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: options.stdio ?? "pipe",
  });
}

function cleanup() {
  if (!cleanupNeeded) {
    return;
  }

  try {
    run("git", ["worktree", "remove", "--force", tempDir], root, { stdio: "pipe" });
  } catch {}

  rmSync(tempDir, { force: true, recursive: true });
}

try {
  run("git", ["worktree", "add", "--detach", tempDir, "HEAD"]);
  cleanupNeeded = true;

  const workspaceNodeModules = resolve(tempDir, "node_modules");
  if (!existsSync(workspaceNodeModules)) {
    symlinkSync(resolve(root, "node_modules"), workspaceNodeModules, "dir");
  }

  run("npm", ["run", "prepare"], tempDir, { stdio: "inherit" });
  run("git", ["config", "user.name", "Granola Toolkit Smoke"], tempDir);
  run("git", ["config", "user.email", "smoke@example.com"], tempDir);

  const target = resolve(tempDir, "src/web/client-state.ts");
  const original = readFileSync(target, "utf8");
  const next = original.replace("Current workspace", "Current workspace snapshot");
  if (next === original) {
    throw new Error("Unable to create smoke-test change in src/web/client-state.ts.");
  }

  writeFileSync(target, next, "utf8");

  run("git", ["add", "src/web/client-state.ts"], tempDir);
  run("git", ["commit", "-m", "test: smoke pre-commit web bundle"], tempDir, { stdio: "inherit" });

  const committedFiles = run("git", ["show", "--name-only", "--format=", "HEAD"], tempDir)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (!committedFiles.includes("src/web/generated.ts")) {
    throw new Error(
      "Pre-commit smoke test failed: commit did not include src/web/generated.ts for a transitive web dependency.",
    );
  }

  run("npm", ["run", "web:check"], tempDir, { stdio: "inherit" });
} catch (error) {
  cleanup();
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
  process.exit();
}

cleanup();
