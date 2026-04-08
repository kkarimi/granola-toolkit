import type {
  TranscriptExportRecord,
  TranscriptExportSegmentRecord,
  TranscriptOutputFormat,
} from "./app/models.ts";
import { syncManagedExports } from "./export-state.ts";
import { buildTranscriptSpeakers } from "./meeting-roles.ts";
import { toJson, toYaml } from "./render.ts";
import type { CacheData, CacheDocument, TranscriptSegment } from "./types.ts";
import {
  compareStrings,
  formatTimestampForTranscript,
  sanitiseFilename,
  transcriptSpeakerLabel,
} from "./utils.ts";

function transcriptSegmentKey(segment: TranscriptSegment): string {
  if (segment.id) {
    return `id:${segment.id}`;
  }

  return [segment.documentId, segment.source, segment.startTimestamp, segment.endTimestamp].join(
    "|",
  );
}

function compareSegmentTimestamps(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);

  if (!Number.isNaN(leftTime) && !Number.isNaN(rightTime)) {
    return leftTime - rightTime;
  }

  return compareStrings(left, right);
}

function compareTranscriptSegments(left: TranscriptSegment, right: TranscriptSegment): number {
  return (
    compareSegmentTimestamps(left.startTimestamp, right.startTimestamp) ||
    compareSegmentTimestamps(left.endTimestamp, right.endTimestamp) ||
    compareStrings(left.source, right.source) ||
    compareStrings(left.id, right.id) ||
    compareStrings(left.text, right.text)
  );
}

function preferredTranscriptSegment(
  current: TranscriptSegment | undefined,
  candidate: TranscriptSegment,
): TranscriptSegment {
  if (!current) {
    return candidate;
  }

  if (candidate.isFinal !== current.isFinal) {
    return candidate.isFinal ? candidate : current;
  }

  return compareSegmentTimestamps(candidate.endTimestamp, current.endTimestamp) > 0 ||
    candidate.text.length > current.text.length
    ? candidate
    : current;
}

export function normaliseTranscriptSegments(segments: TranscriptSegment[]): TranscriptSegment[] {
  const selected = new Map<string, TranscriptSegment>();

  for (const segment of [...segments].sort(compareTranscriptSegments)) {
    const key = transcriptSegmentKey(segment);
    const current = selected.get(key);
    selected.set(key, preferredTranscriptSegment(current, segment));
  }

  const resolved = [...selected.values()].sort(compareTranscriptSegments);
  if (resolved.some((segment) => segment.isFinal)) {
    return resolved.filter((segment) => segment.isFinal);
  }

  return resolved;
}

export function buildTranscriptExport(
  document: CacheDocument,
  segments: TranscriptSegment[],
  rawSegments: TranscriptSegment[] = segments,
): TranscriptExportRecord {
  const renderedSegments: TranscriptExportSegmentRecord[] = segments.map((segment) => ({
    endTimestamp: segment.endTimestamp,
    id: segment.id,
    isFinal: segment.isFinal,
    source: segment.source,
    speaker: transcriptSpeakerLabel(segment),
    startTimestamp: segment.startTimestamp,
    text: segment.text,
  }));

  return {
    createdAt: document.createdAt,
    id: document.id,
    raw: {
      document,
      segments: rawSegments,
    },
    segments: renderedSegments,
    speakers: buildTranscriptSpeakers(segments),
    title: document.title,
    updatedAt: document.updatedAt,
  };
}

export function renderTranscriptExport(
  transcript: TranscriptExportRecord,
  format: TranscriptOutputFormat = "text",
): string {
  switch (format) {
    case "json":
      return toJson({
        createdAt: transcript.createdAt,
        id: transcript.id,
        segments: transcript.segments,
        speakers: transcript.speakers,
        title: transcript.title,
        updatedAt: transcript.updatedAt,
      });
    case "raw":
      return toJson(transcript.raw);
    case "yaml":
      return toYaml({
        createdAt: transcript.createdAt,
        id: transcript.id,
        segments: transcript.segments,
        speakers: transcript.speakers,
        title: transcript.title,
        updatedAt: transcript.updatedAt,
      });
    case "markdown":
      return formatTranscriptMarkdown(transcript);
    case "text":
      break;
  }

  return formatTranscriptText(transcript);
}

function formatTranscriptText(transcript: TranscriptExportRecord): string {
  if (transcript.segments.length === 0) {
    return "";
  }

  const header = [
    "=".repeat(80),
    transcript.title || transcript.id,
    `ID: ${transcript.id}`,
    transcript.createdAt ? `Created: ${transcript.createdAt}` : "",
    transcript.updatedAt ? `Updated: ${transcript.updatedAt}` : "",
    `Segments: ${transcript.segments.length}`,
    transcript.speakers.length > 0
      ? `Speakers: ${transcript.speakers.map((speaker) => speaker.label).join(", ")}`
      : "",
    "=".repeat(80),
    "",
  ].filter(Boolean);

  const body = transcript.segments.map((segment) => {
    const time = formatTimestampForTranscript(segment.startTimestamp);
    return `[${time}] ${segment.speaker}: ${segment.text}`;
  });

  return `${[...header, ...body].join("\n").trimEnd()}\n`;
}

function formatTranscriptMarkdown(transcript: TranscriptExportRecord): string {
  const lines: string[] = [];

  if (transcript.title.trim()) {
    lines.push(`# ${transcript.title.trim()}`, "");
  }

  lines.push(
    `- ID: ${transcript.id}`,
    `- Created: ${transcript.createdAt || "Unknown"}`,
    `- Updated: ${transcript.updatedAt || "Unknown"}`,
    `- Segments: ${transcript.segments.length}`,
  );

  if (transcript.speakers.length > 0) {
    lines.push(`- Speakers: ${transcript.speakers.map((speaker) => speaker.label).join(", ")}`);
  }

  lines.push("", "## Transcript", "");

  if (transcript.segments.length === 0) {
    lines.push("(Transcript unavailable)");
  } else {
    for (const segment of transcript.segments) {
      const time = formatTimestampForTranscript(segment.startTimestamp);
      lines.push(`- [${time}] **${segment.speaker}:** ${segment.text}`);
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export function formatTranscript(document: CacheDocument, segments: TranscriptSegment[]): string {
  const normalisedSegments = normaliseTranscriptSegments(segments);
  return renderTranscriptExport(
    buildTranscriptExport(document, normalisedSegments, segments),
    "text",
  );
}

function transcriptFilename(document: CacheDocument): string {
  return sanitiseFilename(document.title || document.id, "untitled");
}

export function transcriptFileStem(document: CacheDocument): string {
  return transcriptFilename(document);
}

function transcriptFileExtension(format: TranscriptOutputFormat): string {
  switch (format) {
    case "json":
      return ".json";
    case "markdown":
      return ".md";
    case "raw":
      return ".raw.json";
    case "text":
      return ".txt";
    case "yaml":
      return ".yaml";
  }
}

export async function writeTranscripts(
  cacheData: CacheData,
  outputDir: string,
  format: TranscriptOutputFormat = "text",
  options: {
    onProgress?: (progress: {
      completed: number;
      total: number;
      written: number;
    }) => Promise<void> | void;
    renderContent?: (
      transcript: TranscriptExportRecord,
      document: CacheDocument,
      segments: TranscriptSegment[],
    ) => string;
  } = {},
): Promise<number> {
  const entries = Object.entries(cacheData.transcripts)
    .filter(([, segments]) => segments.length > 0)
    .sort(([leftId], [rightId]) => {
      const leftDocument = cacheData.documents[leftId];
      const rightDocument = cacheData.documents[rightId];
      return (
        compareStrings(leftDocument?.title || leftId, rightDocument?.title || rightId) ||
        compareStrings(leftId, rightId)
      );
    });

  return await syncManagedExports({
    items: entries.flatMap(([documentId, segments]) => {
      const document = cacheData.documents[documentId] ?? {
        createdAt: "",
        id: documentId,
        title: documentId,
        updatedAt: "",
      };

      const normalisedSegments = normaliseTranscriptSegments(segments);
      const transcript = buildTranscriptExport(document, normalisedSegments, segments);
      const content =
        options.renderContent?.(transcript, document, segments) ??
        renderTranscriptExport(transcript, format);
      if (!content) {
        return [];
      }

      return [
        {
          content,
          extension: transcriptFileExtension(format),
          id: document.id,
          preferredStem: transcriptFileStem(document),
          sourceUpdatedAt: document.updatedAt,
        },
      ];
    }),
    kind: "transcripts",
    onProgress: options.onProgress,
    outputDir,
  });
}
