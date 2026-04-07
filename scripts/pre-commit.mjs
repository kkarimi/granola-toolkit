#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import { affectsWebBundle } from "./web-bundle-inputs.mjs";

const root = resolve(import.meta.dirname, "..");

function run(command, commandArgs) {
  execFileSync(command, commandArgs, {
    cwd: root,
    stdio: "inherit",
  });
}

function stagedFiles() {
  const output = execFileSync("git", ["diff", "--cached", "--name-only"], {
    cwd: root,
    encoding: "utf8",
  });

  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

const files = stagedFiles();

run("vp", ["staged"]);

if (affectsWebBundle(files)) {
  run("npm", ["run", "web:build"]);
}
