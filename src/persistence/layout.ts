import { homedir, platform } from "node:os";
import { join } from "node:path";

export type GranolaToolkitSessionStoreKind = "file" | "keychain";

export interface GranolaToolkitPersistenceLayout {
  agentHarnessesFile: string;
  automationArtefactsFile: string;
  automationMatchesFile: string;
  automationRulesFile: string;
  automationRunsFile: string;
  apiKeyFile: string;
  dataDirectory: string;
  exportJobsFile: string;
  meetingIndexFile: string;
  pluginsFile: string;
  pkmTargetsFile: string;
  searchIndexFile: string;
  serviceLogFile: string;
  serviceStateFile: string;
  sessionFile: string;
  sessionStoreKind: GranolaToolkitSessionStoreKind;
  syncEventsFile: string;
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
    agentHarnessesFile: join(dataDirectory, "agent-harnesses.json"),
    automationArtefactsFile: join(dataDirectory, "automation-artefacts.json"),
    automationMatchesFile: join(dataDirectory, "automation-matches.jsonl"),
    automationRulesFile: join(dataDirectory, "automation-rules.json"),
    automationRunsFile: join(dataDirectory, "automation-runs.jsonl"),
    apiKeyFile: join(dataDirectory, "api-key.txt"),
    dataDirectory,
    exportJobsFile: join(dataDirectory, "export-jobs.json"),
    meetingIndexFile: join(dataDirectory, "meeting-index.json"),
    pluginsFile: join(dataDirectory, "plugins.json"),
    pkmTargetsFile: join(dataDirectory, "pkm-targets.json"),
    searchIndexFile: join(dataDirectory, "search-index.json"),
    serviceLogFile: join(dataDirectory, "service.log"),
    serviceStateFile: join(dataDirectory, "service.json"),
    sessionFile: join(dataDirectory, "session.json"),
    sessionStoreKind: targetPlatform === "darwin" ? "keychain" : "file",
    syncEventsFile: join(dataDirectory, "sync-events.jsonl"),
    syncStateFile: join(dataDirectory, "sync-state.json"),
  };
}
