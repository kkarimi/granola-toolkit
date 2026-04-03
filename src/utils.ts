import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { NodeHtmlMarkdown } from "node-html-markdown";

import type { GranolaDocument, TranscriptSegment } from "./types.ts";

const INVALID_FILENAME_CHARS = /[<>:"/\\|?*]/g;
const CONTROL_CHARACTERS = /\p{Cc}/gu;
const MULTIPLE_UNDERSCORES = /_+/g;
const HTML_TAGS = /<[^>]+>/g;
const MULTIPLE_BLANK_LINES = /\n{3,}/g;
const htmlMarkdown = new NodeHtmlMarkdown({
  bulletMarker: "-",
  ignore: ["script", "style"],
});

export function normaliseNewlines(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

export function quoteYamlString(value: string): string {
  return JSON.stringify(value);
}

export function sanitiseFilename(name: string, fallback = "untitled"): string {
  const normalised = name
    .trim()
    .replace(INVALID_FILENAME_CHARS, "_")
    .replace(CONTROL_CHARACTERS, "_")
    .replace(MULTIPLE_UNDERSCORES, "_")
    .replace(/^_+|_+$/g, "");

  const safeName = normalised || fallback;
  return safeName.slice(0, 100);
}

export function makeUniqueFilename(filename: string, used: Map<string, number>): string {
  const currentCount = used.get(filename) ?? 0;
  if (currentCount === 0) {
    used.set(filename, 1);
    return filename;
  }

  const unique = `${filename}_${currentCount + 1}`;
  used.set(filename, currentCount + 1);
  used.set(unique, 1);
  return unique;
}

export function compareStrings(left: string, right: string): number {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

export function firstExistingPath(candidates: string[]): string | undefined {
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

export function granolaSupabaseCandidates(): string[] {
  const home = homedir();
  const appData = process.env.APPDATA;

  switch (process.platform) {
    case "darwin":
      return [join(home, "Library", "Application Support", "Granola", "supabase.json")];
    case "win32":
      return appData ? [join(appData, "Granola", "supabase.json")] : [];
    default:
      return [
        join(home, ".config", "Granola", "supabase.json"),
        join(home, ".local", "share", "Granola", "supabase.json"),
      ];
  }
}

export function granolaCacheCandidates(): string[] {
  const home = homedir();
  const appData = process.env.APPDATA;

  switch (process.platform) {
    case "darwin":
      return [
        join(home, "Library", "Application Support", "Granola", "cache-v3.json"),
        join(home, "Library", "Application Support", "Granola", "cache-v6.json"),
        join(home, "Library", "Application Support", "Granola", "cache.json"),
      ];
    case "win32":
      return appData
        ? [
            join(appData, "Granola", "cache-v3.json"),
            join(appData, "Granola", "cache-v6.json"),
            join(appData, "Granola", "cache.json"),
          ]
        : [];
    default:
      return [
        join(home, ".config", "Granola", "cache-v3.json"),
        join(home, ".config", "Granola", "cache-v6.json"),
        join(home, ".config", "Granola", "cache.json"),
        join(home, ".local", "share", "Granola", "cache-v3.json"),
        join(home, ".local", "share", "Granola", "cache-v6.json"),
        join(home, ".local", "share", "Granola", "cache.json"),
      ];
  }
}

export function parseDuration(value: string): number {
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }

  const parts = [...trimmed.matchAll(/(\d+(?:\.\d+)?)(ms|s|m|h|d)/g)];
  if (parts.length === 0) {
    throw new Error(`invalid duration: ${value}`);
  }

  const matchedLength = parts.reduce((total, match) => total + match[0].length, 0);
  if (matchedLength !== trimmed.length) {
    throw new Error(`invalid duration: ${value}`);
  }

  const units: Record<string, number> = {
    d: 24 * 60 * 60 * 1000,
    h: 60 * 60 * 1000,
    m: 60 * 1000,
    ms: 1,
    s: 1000,
  };

  return parts.reduce((total, match) => {
    const amount = Number(match[1]);
    const unit = match[2]!;
    const multiplier = units[unit];
    if (multiplier == null) {
      throw new Error(`invalid duration: ${value}`);
    }

    return total + amount * multiplier;
  }, 0);
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return undefined;
}

export function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

export function parseJsonString<T>(value: string): T | undefined {
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

export function formatTimestampForTranscript(timestamp: string): string {
  const inlineMatch = timestamp.match(/T(\d{2}:\d{2}:\d{2})/);
  if (inlineMatch?.[1]) {
    return inlineMatch[1];
  }

  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return timestamp;
  }

  return parsed.toISOString().slice(11, 19);
}

export function decodeHtmlEntities(value: string): string {
  return value
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

export function stripHtml(value: string): string {
  return normaliseNewlines(decodeHtmlEntities(value).replace(HTML_TAGS, ""))
    .replace(/[ \t]+\n/g, "\n")
    .replace(MULTIPLE_BLANK_LINES, "\n\n")
    .trim();
}

export function htmlToMarkdown(value: string): string {
  if (!value.trim()) {
    return "";
  }

  return normaliseNewlines(htmlMarkdown.translate(value))
    .replace(/[ \t]+\n/g, "\n")
    .replace(MULTIPLE_BLANK_LINES, "\n\n")
    .trim();
}

export function latestDocumentTimestamp(document: GranolaDocument): string {
  const candidates = [
    document.updatedAt,
    document.lastViewedPanel?.updatedAt,
    document.lastViewedPanel?.contentUpdatedAt,
  ].filter((value): value is string => Boolean(value));

  candidates.sort((left, right) => {
    const leftTime = new Date(left).getTime();
    const rightTime = new Date(right).getTime();
    return rightTime - leftTime;
  });

  return candidates[0] ?? document.updatedAt;
}

export async function shouldWriteFile(filePath: string, updatedAt: string): Promise<boolean> {
  try {
    const existing = await stat(filePath);
    const updatedTime = new Date(updatedAt);
    if (Number.isNaN(updatedTime.getTime())) {
      return true;
    }

    return updatedTime.getTime() > existing.mtime.getTime();
  } catch {
    return true;
  }
}

export async function writeTextFile(filePath: string, content: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
}

export async function ensureDirectory(pathname: string): Promise<void> {
  await mkdir(pathname, { recursive: true });
}

export async function readUtf8(pathname: string): Promise<string> {
  return await readFile(pathname, "utf8");
}

export async function listFiles(pathname: string): Promise<string[]> {
  try {
    return await readdir(pathname);
  } catch {
    return [];
  }
}

export function transcriptSpeakerLabel(segment: TranscriptSegment): string {
  return segment.source === "microphone" ? "You" : "System";
}
