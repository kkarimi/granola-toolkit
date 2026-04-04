import { describe, expect, test } from "vite-plus/test";

import {
  allExportScope,
  folderExportScope,
  normaliseExportScope,
  renderExportScopeLabel,
  resolveExportOutputDir,
} from "../src/export-scope.ts";

describe("export scope helpers", () => {
  test("defaults invalid payloads to all-meetings scope", () => {
    expect(normaliseExportScope(undefined)).toEqual({ mode: "all" });
    expect(normaliseExportScope({ mode: "folder" })).toEqual({ mode: "all" });
  });

  test("renders folder scope labels and stable output directories", () => {
    const scope = folderExportScope({
      id: "folder-team-1111",
      name: "Team",
    });

    expect(scope).toEqual({
      folderId: "folder-team-1111",
      folderName: "Team",
      mode: "folder",
    });
    expect(renderExportScopeLabel(scope)).toBe("folder Team");
    expect(resolveExportOutputDir("/tmp/notes", scope)).toBe(
      "/tmp/notes/_folders/folder-team-1111",
    );
    expect(resolveExportOutputDir("/tmp/notes", scope, { scopedDirectory: false })).toBe(
      "/tmp/notes",
    );
    expect(renderExportScopeLabel(allExportScope())).toBe("all meetings");
  });
});
