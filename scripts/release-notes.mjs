#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const repository = process.env.GITHUB_REPOSITORY
  ? `${process.env.GITHUB_SERVER_URL ?? "https://github.com"}/${process.env.GITHUB_REPOSITORY}`
  : "https://github.com/kkarimi/granola-toolkit";
const version = process.env.PACKAGE_VERSION ?? pkg.version;
const packageName = process.env.PACKAGE_NAME ?? pkg.name;
const tag = `v${version}`;

const lines = [
  "## Release Metadata",
  "",
  `- npm: [${packageName}@${version}](https://www.npmjs.com/package/${packageName}/v/${version})`,
  `- install: \`npm install -g ${packageName}@${version}\``,
  `- docs: ${pkg.homepage}`,
  `- compare: ${repository}/compare/${tag}^...${tag}`,
];

process.stdout.write(`${lines.join("\n")}\n`);
