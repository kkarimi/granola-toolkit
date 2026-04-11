import { createDefaultAgentHarnessStore } from "../agent-harnesses.ts";
import { createDefaultAutomationArtefactStore } from "../automation-artefacts.ts";
import { createDefaultAutomationAgentRunner } from "../agents.ts";
import { createDefaultAutomationMatchStore } from "../automation-matches.ts";
import { createDefaultAutomationRunStore } from "../automation-runs.ts";
import {
  createDefaultAutomationRuleStore,
  defaultAutomationRulesFilePath,
} from "../automation-rules.ts";
import {
  createDefaultGranolaAuthController,
  createDefaultGranolaRuntime,
  inspectDefaultGranolaAuth,
  loadOptionalGranolaCache,
} from "../client/default.ts";
import { createDefaultCatalogSnapshotStore } from "../catalog-snapshot.ts";
import { createDefaultExportJobStore } from "../export-jobs.ts";
import { createDefaultExportTargetStore } from "../export-targets.ts";
import { createGranEventHookRunner } from "../event-hooks.ts";
import { createDefaultMeetingIndexStore } from "../meeting-index.ts";
import { createDefaultPkmTargetStore } from "../pkm-targets.ts";
import { createDefaultPluginSettingsStore } from "../plugins.ts";
import { createDefaultPluginRegistry } from "../plugin-registry.ts";
import { createDefaultSearchIndexStore } from "../search-index.ts";
import { createDefaultSyncEventStore } from "../sync-events.ts";
import { createDefaultSyncStateStore } from "../sync-state.ts";

import type {
  GranolaAppBootstrapOptions,
  GranolaAppDependencies,
  AppConfig,
} from "./app-dependencies.ts";

export async function loadDefaultGranolaAppDependencies(
  config: AppConfig,
  options: GranolaAppBootstrapOptions = {},
): Promise<GranolaAppDependencies> {
  const auth = await inspectDefaultGranolaAuth(config);
  const catalogSnapshotStore = createDefaultCatalogSnapshotStore();
  const catalogSnapshot = await catalogSnapshotStore.readSnapshot();
  const automationArtefactStore = createDefaultAutomationArtefactStore(
    config.automation?.artefactsFile,
  );
  const automationArtefacts = await automationArtefactStore.readArtefacts({ limit: 0 });
  const automationMatchStore = createDefaultAutomationMatchStore();
  const automationMatches = await automationMatchStore.readMatches(0);
  const automationRunStore = createDefaultAutomationRunStore();
  const automationRuns = await automationRunStore.readRuns({ limit: 0 });
  const automationRuleStore = createDefaultAutomationRuleStore(
    config.automation?.rulesFile ?? defaultAutomationRulesFilePath(),
  );
  const automationRules = await automationRuleStore.readRules();
  const agentHarnessStore = createDefaultAgentHarnessStore(config.agents?.harnessesFile);
  const authController = createDefaultGranolaAuthController(config);
  const exportJobStore = createDefaultExportJobStore();
  const exportJobs = await exportJobStore.readJobs();
  const exportTargetStore = createDefaultExportTargetStore(config.exports?.targetsFile);
  const meetingIndexStore = createDefaultMeetingIndexStore();
  const meetingIndex = await meetingIndexStore.readIndex();
  const pkmTargetStore = createDefaultPkmTargetStore(config.automation?.pkmTargetsFile);
  const pluginRegistry = createDefaultPluginRegistry();
  const pluginSettingsStore = createDefaultPluginSettingsStore(
    config.plugins?.settingsFile,
    pluginRegistry.listPlugins(),
  );
  const eventHookRunner = createGranEventHookRunner({
    hooks: config.hooks?.items ?? [],
    logger: options.logger,
  });
  const searchIndexStore = createDefaultSearchIndexStore();
  const searchIndex = await searchIndexStore.readIndex();
  const syncEventStore = createDefaultSyncEventStore();
  const syncStateStore = createDefaultSyncStateStore();
  const syncState = await syncStateStore.readState();

  return {
    auth,
    agentRunner: createDefaultAutomationAgentRunner(config),
    agentHarnessStore,
    authController,
    automationArtefactStore,
    automationArtefacts,
    automationMatches,
    automationMatchStore,
    automationRunStore,
    automationRuns,
    automationRules,
    automationRuleStore,
    cacheLoader: loadOptionalGranolaCache,
    catalogSnapshot,
    catalogSnapshotStore,
    createGranolaClient: async (mode) =>
      await createDefaultGranolaRuntime(config, options.logger, {
        preferredMode: mode,
      }),
    eventHookRunner,
    exportJobs,
    exportJobStore,
    exportTargetStore,
    logger: options.logger,
    meetingIndex,
    meetingIndexStore,
    now: options.now,
    pkmTargetStore,
    pluginRegistry,
    pluginSettingsStore,
    searchIndex,
    searchIndexStore,
    syncEventStore,
    syncState,
    syncStateStore,
  };
}
