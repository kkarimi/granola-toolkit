import { describe, expect, test } from "vite-plus/test";

import {
  defaultGranolaToolkitDataDirectory,
  defaultGranolaToolkitPersistenceLayout,
} from "../src/persistence/layout.ts";

describe("defaultGranolaToolkitDataDirectory", () => {
  test("uses Application Support on macOS", () => {
    expect(defaultGranolaToolkitDataDirectory("darwin", "/Users/nima")).toBe(
      "/Users/nima/Library/Application Support/granola-toolkit",
    );
  });

  test("uses ~/.config on Linux", () => {
    expect(defaultGranolaToolkitDataDirectory("linux", "/home/nima")).toBe(
      "/home/nima/.config/granola-toolkit",
    );
  });
});

describe("defaultGranolaToolkitPersistenceLayout", () => {
  test("keeps the file layout in one shared directory", () => {
    expect(
      defaultGranolaToolkitPersistenceLayout({
        homeDirectory: "/home/nima",
        platform: "linux",
      }),
    ).toEqual({
      dataDirectory: "/home/nima/.config/granola-toolkit",
      exportJobsFile: "/home/nima/.config/granola-toolkit/export-jobs.json",
      meetingIndexFile: "/home/nima/.config/granola-toolkit/meeting-index.json",
      sessionFile: "/home/nima/.config/granola-toolkit/session.json",
      sessionStoreKind: "file",
      syncStateFile: "/home/nima/.config/granola-toolkit/sync-state.json",
    });
  });

  test("reports the keychain-backed session store on macOS", () => {
    expect(
      defaultGranolaToolkitPersistenceLayout({
        homeDirectory: "/Users/nima",
        platform: "darwin",
      }).sessionStoreKind,
    ).toBe("keychain");
  });
});
