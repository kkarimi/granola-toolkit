#!/usr/bin/env node

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const root = resolve(import.meta.dirname, "..");
export const changelogPath = resolve(root, "CHANGELOG.md");

const SECTION_ORDER = ["Features", "Fixes", "Improvements", "Docs", "Testing", "Internal", "Other"];

const SECTION_LABELS = {
  feat: "Features",
  fix: "Fixes",
  perf: "Improvements",
  refactor: "Improvements",
  docs: "Docs",
  test: "Testing",
  build: "Internal",
  chore: "Internal",
  ci: "Internal",
};

export function execText(command, cwd = root) {
  try {
    return execSync(command, { cwd, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

export function readPackageMetadata() {
  return JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
}

export function parseCommitSubject(subject) {
  const trimmed = subject.trim();
  const match = /^(?<type>[a-z]+)(?:\([^)]+\))?(?<breaking>!)?: (?<summary>.+)$/i.exec(trimmed);

  if (!match?.groups) {
    return { type: "other", summary: trimmed, breaking: false };
  }

  return {
    type: match.groups.type.toLowerCase(),
    summary: match.groups.summary.trim(),
    breaking: match.groups.breaking === "!",
  };
}

export function releaseSectionForType(type) {
  return SECTION_LABELS[type] ?? "Other";
}

export function previousTag() {
  return execText("git describe --tags --abbrev=0");
}

export function previousTagBefore(tag) {
  return execText(`git describe --tags --abbrev=0 "${tag}^"`);
}

export function releaseChanges({ baseTag } = {}) {
  const range = baseTag ? `${baseTag}..HEAD` : "HEAD";
  const output = execText(`git log --format=%H%x09%s ${range}`);

  if (!output) {
    return [];
  }

  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [hash, subject] = line.split("\t");
      const parsed = parseCommitSubject(subject ?? "");
      return {
        hash,
        shortHash: hash.slice(0, 7),
        subject: subject ?? "",
        summary: parsed.summary,
        type: parsed.type,
        breaking: parsed.breaking,
        section: releaseSectionForType(parsed.type),
      };
    })
    .filter((change) => !/^chore: release v/i.test(change.subject));
}

export function groupedReleaseChanges(changes) {
  const groups = new Map();

  for (const section of SECTION_ORDER) {
    groups.set(section, []);
  }

  for (const change of changes) {
    const bucket = groups.get(change.section) ?? [];
    bucket.push(change);
    groups.set(change.section, bucket);
  }

  return SECTION_ORDER.map((section) => ({
    section,
    changes: groups.get(section) ?? [],
  })).filter((group) => group.changes.length > 0);
}

export function releaseHighlights(changes) {
  const preferred = changes.filter((change) =>
    ["Features", "Fixes", "Improvements", "Docs"].includes(change.section),
  );
  const pool = preferred.length > 0 ? preferred : changes;
  return pool.slice(0, 4);
}

export function compareUrl({ repository, baseTag, version }) {
  if (!baseTag) {
    return `${repository}/commits/v${version}`;
  }

  return `${repository}/compare/${baseTag}...v${version}`;
}

export function releaseUrl({ repository, version }) {
  return `${repository}/releases/tag/v${version}`;
}

export function renderChangeBullet(change, repository) {
  const prefix = change.breaking ? "**BREAKING:** " : "";
  return `- ${prefix}${change.summary} ([${change.shortHash}](${repository}/commit/${change.hash}))`;
}

export function renderReleaseEntry({
  packageName,
  version,
  date,
  repository,
  homepage,
  baseTag,
  changes,
}) {
  const groups = groupedReleaseChanges(changes);
  const highlights = releaseHighlights(changes);
  const lines = [`## ${version} - ${date}`, ""];

  if (highlights.length > 0) {
    lines.push("### Highlights", "");
    for (const change of highlights) {
      lines.push(renderChangeBullet(change, repository));
    }
    lines.push("");
  }

  if (groups.length === 0) {
    lines.push("### Changes", "", "- No user-facing changes recorded.", "");
  } else {
    for (const group of groups) {
      lines.push(`### ${group.section}`, "");
      for (const change of group.changes) {
        lines.push(renderChangeBullet(change, repository));
      }
      lines.push("");
    }
  }

  lines.push(
    "### Artefacts",
    "",
    `- npm: [${packageName}@${version}](https://www.npmjs.com/package/${packageName}/v/${version})`,
    `- install: \`npm install -g ${packageName}@${version}\``,
    `- GitHub Release: ${releaseUrl({ repository, version })}`,
    `- standalone binaries: ${releaseUrl({ repository, version })}`,
    `- docs: ${homepage}`,
    `- compare: ${compareUrl({ repository, baseTag, version })}`,
    "",
  );

  return lines.join("\n");
}

export function changelogHeader() {
  return [
    "# Changelog",
    "",
    "All notable changes to `granola-toolkit` are recorded here.",
    "",
  ].join("\n");
}

export function extractChangelogEntry(markdown, version) {
  const marker = `## ${version} - `;
  const start = markdown.indexOf(marker);

  if (start === -1) {
    return "";
  }

  const rest = markdown.slice(start);
  const next = rest.indexOf("\n## ", marker.length);
  return (next === -1 ? rest : rest.slice(0, next)).trim();
}

export function stripChangelogEntry(markdown, version) {
  const marker = `## ${version} - `;
  const start = markdown.indexOf(marker);

  if (start === -1) {
    return markdown;
  }

  const rest = markdown.slice(start);
  const next = rest.indexOf("\n## ", marker.length);

  if (next === -1) {
    return markdown.slice(0, start).trimEnd() + "\n";
  }

  return (markdown.slice(0, start) + rest.slice(next + 1)).trimEnd() + "\n";
}

export function readChangelog() {
  if (!existsSync(changelogPath)) {
    return changelogHeader();
  }

  return readFileSync(changelogPath, "utf8");
}
