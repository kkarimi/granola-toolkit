#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const tempRoot = mkdtempSync(join(tmpdir(), "granola-hook-smoke-"));
const tempDir = join(tempRoot, "repo");

function run(command, args, cwd = root, options = {}) {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: options.stdio ?? "pipe",
  });
}

function cleanup() {
  rmSync(tempRoot, { force: true, recursive: true });
}

try {
  run("git", ["clone", "--quiet", root, tempDir]);

  const workspaceNodeModules = resolve(tempDir, "node_modules");
  if (!existsSync(workspaceNodeModules)) {
    symlinkSync(resolve(root, "node_modules"), workspaceNodeModules, "dir");
  }

  run("npm", ["run", "prepare"], tempDir, { stdio: "inherit" });

  const target = resolve(tempDir, "src/web/client-state.ts");
  const original = readFileSync(target, "utf8");
  const next = original.replace("Current workspace", "Current workspace snapshot");
  if (next === original) {
    throw new Error("Unable to create smoke-test change in src/web/client-state.ts.");
  }

  writeFileSync(target, next, "utf8");

  run("git", ["add", "src/web/client-state.ts"], tempDir);
  run(
    "git",
    [
      "-c",
      "user.name=Granola Toolkit Smoke",
      "-c",
      "user.email=smoke@example.com",
      "commit",
      "-m",
      "test: smoke pre-commit web bundle",
    ],
    tempDir,
    { stdio: "inherit" },
  );

  const committedFiles = run("git", ["show", "--name-only", "--format=", "HEAD"], tempDir)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (committedFiles.includes("src/web/generated.ts")) {
    throw new Error(
      "Pre-commit smoke test failed: commit should not include ignored src/web/generated.ts.",
    );
  }

  if (!existsSync(resolve(tempDir, "src/web/generated.ts"))) {
    throw new Error(
      "Pre-commit smoke test failed: ignored src/web/generated.ts was not regenerated.",
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
