import type { GranolaAgentHarness, AgentHarnessStore } from "../agent-harnesses.ts";
import type { GranolaAgentProviderRegistry } from "../agent-provider-registry.ts";
import type { GranolaAutomationActionRegistry } from "../automation-action-registry.ts";
import type { AutomationArtefactStore } from "../automation-artefacts.ts";
import type { AutomationMatchStore } from "../automation-matches.ts";
import type { AutomationRunStore } from "../automation-runs.ts";
import type { AutomationRuleStore } from "../automation-rules.ts";
import type {
  DefaultGranolaAuthController,
  GranolaSyncAdapterRegistry,
} from "../client/default.ts";
import type { CatalogSnapshotStore, GranolaCatalogSnapshot } from "../catalog-snapshot.ts";
import type { ExportJobStore } from "../export-jobs.ts";
import type { ExportTargetStore } from "../export-targets.ts";
import type { GranolaFolder, AppConfig, CacheData } from "../types.ts";
import type { MeetingIndexStore } from "../meeting-index.ts";
import type { PkmTargetStore } from "../pkm-targets.ts";
import type { PluginSettingsStore } from "../plugins.ts";
import type { GranEventHookRunner } from "../event-hooks.ts";
import type { SyncStateStore } from "../sync-state.ts";
import type { SyncEventStore } from "../sync-events.ts";
import type { GranolaSearchIndexEntry, SearchIndexStore } from "../search-index.ts";

import type {
  GranolaAppAuthMode,
  GranolaAppAuthState,
  GranolaAppExportJobState,
  GranolaAutomationArtefact,
  GranolaAutomationMatch,
  GranolaAutomationRule,
  GranolaAutomationActionRun,
} from "./types.ts";
import type { MeetingSummaryRecord } from "./models.ts";
import type { GranolaCatalogClient, GranolaCatalogLiveSnapshot } from "./catalog.ts";
import type { GranolaExporterRegistry } from "./export-registry.ts";

export interface GranolaAppDependencies {
  agentHarnessStore?: AgentHarnessStore;
  agentProviderRegistry?: GranolaAgentProviderRegistry;
  agentRunner?: import("../agents.ts").GranolaAutomationAgentRunner;
  auth: GranolaAppAuthState;
  authController?: DefaultGranolaAuthController;
  automationActionRegistry?: GranolaAutomationActionRegistry;
  automationArtefactStore?: AutomationArtefactStore;
  automationArtefacts?: GranolaAutomationArtefact[];
  automationMatchStore?: AutomationMatchStore;
  automationMatches?: GranolaAutomationMatch[];
  automationRunStore?: AutomationRunStore;
  automationRuns?: GranolaAutomationActionRun[];
  automationRuleStore?: AutomationRuleStore;
  automationRules?: GranolaAutomationRule[];
  catalogSnapshot?: GranolaCatalogSnapshot;
  catalogSnapshotStore?: CatalogSnapshotStore;
  cacheLoader: (cacheFile?: string) => Promise<CacheData | undefined>;
  createGranolaClient?: (mode?: GranolaAppAuthMode) => Promise<{
    auth: GranolaAppAuthState;
    client: GranolaCatalogClient;
  }>;
  eventHookRunner?: GranEventHookRunner;
  exportJobStore?: ExportJobStore;
  exportTargetStore?: ExportTargetStore;
  exporterRegistry?: GranolaExporterRegistry;
  exportJobs?: GranolaAppExportJobState[];
  granolaClient?: GranolaCatalogClient;
  logger?: Pick<Console, "warn">;
  meetingIndex?: MeetingSummaryRecord[];
  meetingIndexStore?: MeetingIndexStore;
  now?: () => Date;
  pkmTargetStore?: PkmTargetStore;
  pluginRegistry?: import("../plugin-registry.ts").GranolaPluginRegistry;
  pluginSettingsStore?: PluginSettingsStore;
  searchIndex?: GranolaSearchIndexEntry[];
  searchIndexStore?: SearchIndexStore;
  syncAdapterRegistry?: GranolaSyncAdapterRegistry;
  syncEventStore?: SyncEventStore;
  syncState?: import("./types.ts").GranolaAppSyncState;
  syncStateStore?: SyncStateStore;
}

export interface GranolaAppBootstrapOptions {
  logger?: Pick<Console, "warn">;
  now?: () => Date;
}

export type { GranolaAgentHarness, GranolaFolder, GranolaCatalogLiveSnapshot, AppConfig };
