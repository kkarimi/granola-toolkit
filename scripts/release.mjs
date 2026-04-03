#!/usr/bin/env node

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const pkgPath = resolve(root, "package.json");
const kind = process.argv[2] ?? "patch";
const supportedKinds = new Set(["patch", "minor", "major"]);

const run = (command) => {
  execSync(command, { cwd: root, stdio: "inherit" });
};

const execText = (command) => execSync(command, { cwd: root, encoding: "utf8" }).trim();

const ensureCleanTree = () => {
  const status = execText("git status --porcelain");
  if (status) {
    throw new Error("Working tree is not clean. Commit or stash changes first.");
  }
};

const ensureMainBranch = () => {
  const branch = execText("git rev-parse --abbrev-ref HEAD");
  if (branch !== "main") {
    throw new Error(`Release must run on main (current: ${branch}).`);
  }
};

const release = () => {
  ensureCleanTree();
  ensureMainBranch();

  if (!supportedKinds.has(kind)) {
    throw new Error(`Unsupported release kind: ${kind}. Use patch, minor, or major.`);
  }

  run("vp check");
  run("vp test");
  run("vp pack");
  run("npm pack --dry-run");
  run(`npm version ${kind} --no-git-tag-version`);

  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  const next = pkg.version;

  run("git add package.json package-lock.json");
  run(`git commit -m "chore: release v${next}"`);
  run("git push origin main");
};

try {
  release();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
