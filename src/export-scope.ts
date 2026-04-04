import { join } from "node:path";

import type { FolderSummaryRecord } from "./app/models.ts";
import type { GranolaExportScope } from "./app/types.ts";
import { asRecord, sanitiseFilename, stringValue } from "./utils.ts";

const FOLDER_EXPORT_DIRECTORY = "_folders";
const MEETING_EXPORT_DIRECTORY = "_meetings";

export function allExportScope(): GranolaExportScope {
  return {
    mode: "all",
  };
}

export function folderExportScope(
  folder: Pick<FolderSummaryRecord, "id" | "name">,
): GranolaExportScope {
  return {
    folderId: folder.id,
    folderName: folder.name || folder.id,
    mode: "folder",
  };
}

export function cloneExportScope(scope: GranolaExportScope): GranolaExportScope {
  if (scope.mode === "folder" || scope.mode === "meeting") {
    return { ...scope };
  }

  return { mode: "all" };
}

export function normaliseExportScope(value: unknown): GranolaExportScope {
  const record = asRecord(value);
  if (!record) {
    return allExportScope();
  }

  if (record.mode === "meeting") {
    const meetingId = stringValue(record.meetingId);
    const meetingTitle = stringValue(record.meetingTitle) || meetingId;
    if (!meetingId) {
      return allExportScope();
    }

    return {
      meetingId,
      meetingTitle,
      mode: "meeting",
    };
  }

  if (record.mode !== "folder") {
    return allExportScope();
  }

  const folderId = stringValue(record.folderId);
  const folderName = stringValue(record.folderName) || folderId;
  if (!folderId) {
    return allExportScope();
  }

  return {
    folderId,
    folderName,
    mode: "folder",
  };
}

export function meetingExportScope(meeting: {
  meetingId: string;
  meetingTitle: string;
}): GranolaExportScope {
  return {
    meetingId: meeting.meetingId,
    meetingTitle: meeting.meetingTitle || meeting.meetingId,
    mode: "meeting",
  };
}

export function renderExportScopeLabel(scope: GranolaExportScope): string {
  if (scope.mode === "folder") {
    return `folder ${scope.folderName}`;
  }

  if (scope.mode === "meeting") {
    return `meeting ${scope.meetingTitle}`;
  }

  return "all meetings";
}

export function resolveExportOutputDir(
  outputDir: string,
  scope: GranolaExportScope,
  options: {
    scopedDirectory?: boolean;
  } = {},
): string {
  if (options.scopedDirectory === false || scope.mode === "all") {
    return outputDir;
  }

  if (scope.mode === "folder") {
    return join(outputDir, FOLDER_EXPORT_DIRECTORY, sanitiseFilename(scope.folderId, "folder"));
  }

  return join(outputDir, MEETING_EXPORT_DIRECTORY, sanitiseFilename(scope.meetingId, "meeting"));
}
