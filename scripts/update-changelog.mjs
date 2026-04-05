#!/usr/bin/env node

import { writeFileSync } from "node:fs";

import {
  changelogHeader,
  changelogPath,
  previousTag,
  readChangelog,
  readPackageMetadata,
  releaseChanges,
  renderReleaseEntry,
  stripChangelogEntry,
} from "./release-data.mjs";

const pkg = readPackageMetadata();
const repository = process.env.GITHUB_REPOSITORY
  ? `${process.env.GITHUB_SERVER_URL ?? "https://github.com"}/${process.env.GITHUB_REPOSITORY}`
  : "https://github.com/kkarimi/granola-toolkit";
const version = pkg.version;
const date = new Date().toISOString().slice(0, 10);
const baseTag = previousTag();
const changes = releaseChanges({ repository, baseTag });
const entry = renderReleaseEntry({
  packageName: pkg.name,
  version,
  date,
  repository,
  homepage: pkg.homepage,
  baseTag,
  changes,
});

const existing = stripChangelogEntry(readChangelog(), version).trimEnd();
const header = existing.startsWith("# Changelog") ? existing : changelogHeader().trimEnd();
const next = `${header}\n\n${entry}\n`;

writeFileSync(changelogPath, next);
