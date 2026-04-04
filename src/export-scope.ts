import { join } from "node:path";

import type { FolderSummaryRecord } from "./app/models.ts";
import type { GranolaExportScope } from "./app/types.ts";
import { asRecord, sanitiseFilename, stringValue } from "./utils.ts";

const FOLDER_EXPORT_DIRECTORY = "_folders";

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
  return scope.mode === "folder" ? { ...scope } : { mode: "all" };
}

export function normaliseExportScope(value: unknown): GranolaExportScope {
  const record = asRecord(value);
  if (!record) {
    return allExportScope();
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

export function renderExportScopeLabel(scope: GranolaExportScope): string {
  return scope.mode === "folder" ? `folder ${scope.folderName}` : "all meetings";
}

export function resolveExportOutputDir(
  outputDir: string,
  scope: GranolaExportScope,
  options: {
    scopedDirectory?: boolean;
  } = {},
): string {
  if (scope.mode !== "folder" || options.scopedDirectory === false) {
    return outputDir;
  }

  return join(outputDir, FOLDER_EXPORT_DIRECTORY, sanitiseFilename(scope.folderId, "folder"));
}
