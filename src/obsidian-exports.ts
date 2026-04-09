import { basename, extname, join } from "node:path";

import type {
  GranolaExportTarget,
  NoteOutputFormat,
  NoteExportRecord,
  TranscriptOutputFormat,
  TranscriptExportRecord,
} from "./app/index.ts";
import { syncManagedExports } from "./export-state.ts";
import { resolveExportTargetSubdir } from "./export-targets.ts";
import { noteFileStem } from "./notes.ts";
import {
  buildPkmMeetingContextFromDocument,
  buildPkmNoteArtifact,
  buildPkmTranscriptArtifact,
} from "./pkm-artifacts.ts";
import { transcriptFileStem } from "./transcripts.ts";
import type { CacheDocument, GranolaDocument } from "./types.ts";
import { latestDocumentTimestamp, quoteYamlString } from "./utils.ts";

function meetingDateValue(document: Pick<GranolaDocument, "calendarEvent" | "createdAt">): string {
  const timestamp = document.calendarEvent?.startTime || document.createdAt;
  return timestamp.trim() ? timestamp.slice(0, 10) : "unknown-date";
}

function uniqueValues(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])];
}

function obsidianLinkForPath(pathname: string): string {
  const withoutExtension = pathname.replace(extname(pathname), "");
  return `[[${withoutExtension.replaceAll("\\", "/")}]]`;
}

function attendeesForDocument(document: GranolaDocument): string[] {
  return uniqueValues(
    document.people?.attendees.map((person) => person.name || person.email || person.companyName) ??
      [],
  );
}

function frontmatterLines(entries: Array<[string, string | string[] | undefined]>): string[] {
  const lines = ["---"];

  for (const [key, value] of entries) {
    if (value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      if (value.length === 0) {
        lines.push("  []");
        continue;
      }

      for (const item of value) {
        lines.push(`  - ${quoteYamlString(item)}`);
      }
      continue;
    }

    lines.push(`${key}: ${quoteYamlString(value)}`);
  }

  lines.push("---", "");
  return lines;
}

export function obsidianNoteRelativePath(
  target: GranolaExportTarget,
  document: GranolaDocument,
): string {
  return join(resolveExportTargetSubdir(target, "notes"), `${noteFileStem(document)}.md`);
}

export function obsidianTranscriptRelativePath(
  target: GranolaExportTarget,
  document: CacheDocument,
): string {
  return join(
    resolveExportTargetSubdir(target, "transcripts"),
    `${transcriptFileStem(document)}.md`,
  );
}

export function renderObsidianNoteExport(options: {
  document: GranolaDocument;
  note: NoteExportRecord;
  target: GranolaExportTarget;
  transcriptRelativePath?: string;
}): string {
  const meeting = buildPkmMeetingContextFromDocument(options.document);
  const artifact = buildPkmNoteArtifact(meeting, options.note);
  const meetingDate = meeting.meetingDate;
  const folders = meeting.folders.map((folder) => folder.name);
  const attendees = attendeesForDocument(options.document);
  const dailyNoteRelativePath = options.target.dailyNotesDir
    ? join(options.target.dailyNotesDir, `${meetingDate}.md`)
    : undefined;
  const transcriptLink = options.transcriptRelativePath
    ? obsidianLinkForPath(options.transcriptRelativePath)
    : undefined;
  const dailyNoteLink = dailyNoteRelativePath
    ? obsidianLinkForPath(dailyNoteRelativePath)
    : undefined;

  const lines = frontmatterLines([
    ["title", artifact.title || artifact.provenance.sourceId],
    ["granola_id", artifact.provenance.sourceId],
    ["type", "note"],
    ["meeting_date", meetingDate],
    ["created", artifact.createdAt],
    ["updated", artifact.updatedAt],
    ["content_source", artifact.contentSource],
    ["folders", folders],
    ["tags", meeting.tags],
    ["attendees", attendees],
    ["transcript", transcriptLink],
    ["daily_note", dailyNoteLink],
  ]);

  const relatedLines = [
    transcriptLink ? `- Transcript: ${transcriptLink}` : undefined,
    dailyNoteLink ? `- Daily note: ${dailyNoteLink}` : undefined,
  ].filter(Boolean) as string[];

  if (relatedLines.length > 0) {
    lines.push("## Related", "", ...relatedLines, "");
  }

  if (artifact.markdown) {
    lines.push(artifact.markdown);
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export function renderObsidianTranscriptExport(options: {
  document: GranolaDocument;
  noteRelativePath?: string;
  target: GranolaExportTarget;
  transcript: TranscriptExportRecord;
}): string {
  const meeting = buildPkmMeetingContextFromDocument(options.document);
  const artifact = buildPkmTranscriptArtifact(meeting, options.transcript);
  const meetingDate = meeting.meetingDate;
  const folders = meeting.folders.map((folder) => folder.name);
  const attendees = attendeesForDocument(options.document);
  const noteLink = options.noteRelativePath
    ? obsidianLinkForPath(options.noteRelativePath)
    : undefined;
  const dailyNoteRelativePath = options.target.dailyNotesDir
    ? join(options.target.dailyNotesDir, `${meetingDate}.md`)
    : undefined;
  const dailyNoteLink = dailyNoteRelativePath
    ? obsidianLinkForPath(dailyNoteRelativePath)
    : undefined;
  const lines = frontmatterLines([
    ["title", `${artifact.title || artifact.provenance.sourceId} Transcript`],
    ["granola_id", artifact.provenance.sourceId],
    ["type", "transcript"],
    ["meeting_date", meetingDate],
    ["created", artifact.createdAt],
    ["updated", artifact.updatedAt],
    ["folders", folders],
    ["attendees", attendees],
    ["note", noteLink],
    ["daily_note", dailyNoteLink],
  ]);

  if (noteLink || dailyNoteLink) {
    lines.push("## Related", "");
    if (noteLink) {
      lines.push(`- Note: ${noteLink}`);
    }
    if (dailyNoteLink) {
      lines.push(`- Daily note: ${dailyNoteLink}`);
    }
    lines.push("");
  }
  lines.push("## Transcript", "");
  lines.push(artifact.markdown);

  return `${lines.join("\n").trimEnd()}\n`;
}

export async function syncObsidianDailyNotes(options: {
  documents: GranolaDocument[];
  notesFormat?: NoteOutputFormat;
  outputDir: string;
  target: GranolaExportTarget;
  transcriptsFormat?: TranscriptOutputFormat;
}): Promise<number> {
  if (!options.target.dailyNotesDir?.trim()) {
    return 0;
  }

  const includeNoteLinks = (options.notesFormat ?? "markdown") === "markdown";
  const includeTranscriptLinks = (options.transcriptsFormat ?? "markdown") === "markdown";
  const dailyNotesOutputDir = join(options.outputDir, options.target.dailyNotesDir.trim());
  const grouped = new Map<
    string,
    {
      documentIds: string[];
      noteLinks: string[];
      transcriptLinks: string[];
      sourceUpdatedAt: string;
    }
  >();

  for (const document of options.documents) {
    const date = meetingDateValue(document);
    const current = grouped.get(date) ?? {
      documentIds: [],
      noteLinks: [],
      sourceUpdatedAt: latestDocumentTimestamp(document),
      transcriptLinks: [],
    };
    current.documentIds.push(document.id);
    if (includeNoteLinks) {
      current.noteLinks.push(
        obsidianLinkForPath(obsidianNoteRelativePath(options.target, document)),
      );
    }
    if (includeTranscriptLinks) {
      current.transcriptLinks.push(
        obsidianLinkForPath(
          obsidianTranscriptRelativePath(options.target, {
            createdAt: document.createdAt,
            id: document.id,
            title: document.title || document.id,
            updatedAt: document.updatedAt,
          }),
        ),
      );
    }
    current.sourceUpdatedAt = latestDocumentTimestamp(document);
    grouped.set(date, current);
  }

  return await syncManagedExports({
    items: [...grouped.entries()].map(([date, entry]) => ({
      content: [
        ...frontmatterLines([
          ["title", date],
          ["type", "daily-note"],
          ["date", date],
        ]),
        "## Meetings",
        "",
        ...entry.documentIds.map((_, index) => {
          const noteLink = entry.noteLinks[index];
          const transcriptLink = entry.transcriptLinks[index];
          if (noteLink && transcriptLink) {
            return `- ${noteLink} · ${transcriptLink}`;
          }
          if (noteLink) {
            return `- ${noteLink}`;
          }
          if (transcriptLink) {
            return `- ${transcriptLink}`;
          }
          return "- Meeting";
        }),
      ].join("\n"),
      extension: ".md",
      id: date,
      preferredStem: basename(date, extname(date)),
      sourceUpdatedAt: entry.sourceUpdatedAt,
    })),
    kind: "notes",
    outputDir: dailyNotesOutputDir,
  });
}
