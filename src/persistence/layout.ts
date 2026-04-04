import { homedir, platform } from "node:os";
import { join } from "node:path";

export type GranolaToolkitSessionStoreKind = "file" | "keychain";

export interface GranolaToolkitPersistenceLayout {
  dataDirectory: string;
  exportJobsFile: string;
  meetingIndexFile: string;
  sessionFile: string;
  sessionStoreKind: GranolaToolkitSessionStoreKind;
  syncStateFile: string;
}

export function defaultGranolaToolkitDataDirectory(
  targetPlatform: NodeJS.Platform = platform(),
  homeDirectory = homedir(),
): string {
  return targetPlatform === "darwin"
    ? join(homeDirectory, "Library", "Application Support", "granola-toolkit")
    : join(homeDirectory, ".config", "granola-toolkit");
}

export function defaultGranolaToolkitPersistenceLayout(
  options: {
    homeDirectory?: string;
    platform?: NodeJS.Platform;
  } = {},
): GranolaToolkitPersistenceLayout {
  const targetPlatform = options.platform ?? platform();
  const dataDirectory = defaultGranolaToolkitDataDirectory(
    targetPlatform,
    options.homeDirectory ?? homedir(),
  );

  return {
    dataDirectory,
    exportJobsFile: join(dataDirectory, "export-jobs.json"),
    meetingIndexFile: join(dataDirectory, "meeting-index.json"),
    sessionFile: join(dataDirectory, "session.json"),
    sessionStoreKind: targetPlatform === "darwin" ? "keychain" : "file",
    syncStateFile: join(dataDirectory, "sync-state.json"),
  };
}
