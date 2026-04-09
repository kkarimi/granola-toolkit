import { describe, expect, test } from "vite-plus/test";

import { createGranolaAgentProviderRegistry } from "../src/agent-provider-registry.ts";
import { createDefaultGranolaAutomationActionRegistry } from "../src/automation-action-registry.ts";
import { createDefaultAutomationAgentRunner } from "../src/agents.ts";
import { GranolaApp } from "../src/app/core.ts";
import { GranolaExportService } from "../src/app/export-service.ts";
import { createGranolaExporterRegistry } from "../src/app/export-registry.ts";
import { createGranolaSyncAdapterRegistry } from "../src/client/sync-adapter-registry.ts";
import {
  createDefaultGranolaExportTargetRegistry,
  createGranolaExportTargetRegistry,
} from "../src/export-target-registry.ts";
import {
  createDefaultGranolaIntelligencePresetRegistry,
  createGranolaIntelligencePresetRegistry,
} from "../src/intelligence-presets.ts";
import {
  buildGranolaPkmPublishIdentity,
  createDefaultGranolaPkmTargetRegistry,
  createGranolaPkmTargetRegistry,
} from "../src/pkm-target-registry.ts";
import {
  enabledAutomationActions,
  executeAutomationAction,
  type AutomationActionExecutionHandlers,
} from "../src/automation-actions.ts";
import type {
  AppConfig,
  CacheData,
  GranolaDocument,
  NoteOutputFormat,
  TranscriptOutputFormat,
} from "../src/types.ts";
import type {
  GranolaAppAuthState,
  GranolaAppExportJobState,
  GranolaAutomationCommandAction,
  GranolaAutomationMatch,
  GranolaAutomationRule,
} from "../src/app/index.ts";

function createConfig(): AppConfig {
  return {
    agents: {
      codexCommand: "codex",
      defaultProvider: "codex",
      dryRun: false,
      harnessesFile: "/tmp/agent-harnesses.json",
      maxRetries: 2,
      openaiBaseUrl: "https://api.openai.com/v1",
      openrouterBaseUrl: "https://openrouter.ai/api/v1",
      timeoutMs: 30_000,
    },
    debug: false,
    notes: {
      output: "/tmp/notes",
      timeoutMs: 120_000,
    },
    transcripts: {
      cacheFile: "/tmp/cache.json",
      output: "/tmp/transcripts",
    },
  };
}

const authState: GranolaAppAuthState = {
  apiKeyAvailable: true,
  mode: "api-key",
  refreshAvailable: false,
  storedSessionAvailable: false,
  supabaseAvailable: false,
};

const match: GranolaAutomationMatch = {
  eventId: "sync-1:1",
  eventKind: "meeting.changed",
  folders: [],
  id: "match-1",
  matchedAt: "2024-03-01T12:00:00Z",
  meetingId: "doc-alpha-1111",
  ruleId: "rule-1",
  ruleName: "Rule",
  tags: ["team"],
  title: "Alpha Sync",
  transcriptLoaded: true,
};

const commandAction: GranolaAutomationCommandAction = {
  command: "echo",
  id: "command-1",
  kind: "command",
  sourceActionId: "agent-1",
  trigger: "approval",
};

const rule: GranolaAutomationRule = {
  actions: [commandAction],
  id: "rule-1",
  name: "Rule",
  when: {},
};

const handlers: AutomationActionExecutionHandlers = {
  exportNotes: async () => undefined,
  exportTranscripts: async () => undefined,
  nowIso: () => "2024-03-01T12:00:00Z",
  runAgent: async () => ({
    dryRun: false,
    model: "gpt-5-codex",
    prompt: "unused",
    provider: "codex",
  }),
  runCommand: async () => ({
    command: "echo default",
    output: "default",
  }),
  runPkmSync: async () => ({
    filePath: "/tmp/notes.md",
    targetId: "vault",
  }),
  runSlackMessage: async () => ({
    status: 200,
    text: "default",
    url: "https://example.com/slack",
  }),
  runWebhook: async () => ({
    status: 200,
    url: "https://example.com/webhook",
  }),
  writeFile: async () => ({
    bytes: 1,
    filePath: "/tmp/file.txt",
    format: "text",
  }),
};

describe("extension registries", () => {
  test("allows overriding the agent provider runtime", async () => {
    const registry = createGranolaAgentProviderRegistry().register("codex", {
      kind: "codex",
      async run(context) {
        return {
          command: "custom-codex",
          output: `registry:${context.request.prompt}`,
        };
      },
    });

    const runner = createDefaultAutomationAgentRunner(createConfig(), {
      providerRegistry: registry,
    });

    const result = await runner.run({
      prompt: "Summarise this meeting",
    });

    expect(result).toEqual(
      expect.objectContaining({
        command: "custom-codex",
        output: "registry:Summarise this meeting",
        provider: "codex",
      }),
    );
  });

  test("routes automation action cloning, filtering, and execution through the registry", async () => {
    const registry = createDefaultGranolaAutomationActionRegistry().register("command", {
      kind: "command",
      clone(action) {
        return {
          ...action,
          name: "Registry command",
        };
      },
      async execute(context) {
        return {
          actionId: context.action.id,
          actionKind: context.action.kind,
          actionName: "Registry command",
          eventId: context.match.eventId,
          eventKind: context.match.eventKind,
          folders: [],
          finishedAt: context.handlers.nowIso(),
          id: "registry-run",
          matchId: context.match.id,
          matchedAt: context.match.matchedAt,
          meetingId: context.match.meetingId,
          result: "registry",
          ruleId: context.rule.id,
          ruleName: context.rule.name,
          startedAt: context.handlers.nowIso(),
          status: "completed",
          tags: [...context.match.tags],
          title: context.match.title,
          transcriptLoaded: context.match.transcriptLoaded,
        };
      },
      matchesApprovalSourceAction(action, sourceActionId) {
        return (
          !sourceActionId || (action.kind === "command" && action.sourceActionId === sourceActionId)
        );
      },
      trigger() {
        return "approval";
      },
    });

    const enabled = enabledAutomationActions(rule, {
      registry,
      sourceActionId: "agent-1",
      trigger: "approval",
    });
    expect(enabled).toEqual([
      expect.objectContaining({
        id: "command-1",
        name: "Registry command",
      }),
    ]);

    const run = await executeAutomationAction(match, rule, commandAction, handlers, {
      context: {
        trigger: "approval",
      },
      registry,
    });
    expect(run).toEqual(
      expect.objectContaining({
        actionName: "Registry command",
        id: "registry-run",
        result: "registry",
      }),
    );
  });

  test("exposes export target kinds through a registry", () => {
    const registry = createGranolaExportTargetRegistry().register("bundle-folder", {
      defaultNotesFormat: "markdown",
      defaultNotesSubdir: "notes",
      defaultTranscriptsFormat: "text",
      defaultTranscriptsSubdir: "transcripts",
      description: "Archive folder",
      kind: "bundle-folder",
      label: "Bundle folder",
    });

    expect(registry.resolve("bundle-folder", "export target")).toEqual(
      expect.objectContaining({
        defaultNotesSubdir: "notes",
        label: "Bundle folder",
      }),
    );
    expect(
      createDefaultGranolaExportTargetRegistry().resolve("obsidian-vault", "export target"),
    ).toEqual(
      expect.objectContaining({
        defaultTranscriptsFormat: "markdown",
        supportsDailyNotes: true,
      }),
    );
  });

  test("exposes intelligence presets through a registry", () => {
    const registry = createGranolaIntelligencePresetRegistry().register("summary", {
      description: "Custom summary preset",
      id: "summary",
      label: "Summary",
      prompt: "Summarise the meeting.",
    });

    expect(registry.resolve("summary", "intelligence preset")).toEqual(
      expect.objectContaining({
        id: "summary",
        label: "Summary",
      }),
    );
    expect(
      createDefaultGranolaIntelligencePresetRegistry().resolve("people", "intelligence preset"),
    ).toEqual(
      expect.objectContaining({
        id: "people",
        label: "People",
      }),
    );
  });

  test("exposes PKM target kinds through a registry and builds stable publish identities", () => {
    const registry = createGranolaPkmTargetRegistry().register("docs-folder", {
      description: "Filesystem target",
      kind: "docs-folder",
      label: "Docs folder",
      reviewMode: "recommended",
      supportsFrontmatter: true,
      transport: "filesystem",
    });

    expect(registry.resolve("docs-folder", "PKM target")).toEqual(
      expect.objectContaining({
        label: "Docs folder",
        reviewMode: "recommended",
      }),
    );
    expect(createDefaultGranolaPkmTargetRegistry().resolve("obsidian", "PKM target")).toEqual(
      expect.objectContaining({
        supportsOpenInApp: true,
        transport: "filesystem",
      }),
    );
    expect(
      buildGranolaPkmPublishIdentity({
        actionId: "review-notes",
        artifactKind: "notes",
        meetingId: "doc-alpha-1111",
        meetingTitle: "Alpha Sync",
        target: {
          id: "obsidian-team",
        },
      }),
    ).toEqual({
      fileName: "Alpha Sync-notes.md",
      key: "obsidian-team:doc-alpha-1111:notes:review-notes",
      preferredStem: "Alpha Sync-notes",
    });
  });

  test("lets the export service delegate kinds through the exporter registry", async () => {
    const customJob: GranolaAppExportJobState = {
      completedCount: 0,
      format: "markdown",
      id: "job-notes-1",
      itemCount: 0,
      kind: "notes",
      outputDir: "/tmp/custom-notes",
      scope: {
        mode: "all",
      },
      startedAt: "2024-03-01T12:00:00Z",
      status: "completed",
      written: 0,
    };
    const exporterRegistry = createGranolaExporterRegistry()
      .register("notes", {
        kind: "notes",
        async export() {
          return {
            documentCount: 0,
            documents: [],
            format: "markdown" as NoteOutputFormat,
            job: customJob,
            outputDir: "/tmp/custom-notes",
            scope: { mode: "all" },
            written: 0,
          };
        },
        async rerun() {
          return {
            documentCount: 0,
            documents: [],
            format: "markdown" as NoteOutputFormat,
            job: customJob,
            outputDir: "/tmp/custom-notes",
            scope: { mode: "all" },
            written: 0,
          };
        },
      })
      .register("transcripts", {
        kind: "transcripts",
        async export() {
          return {
            cacheData: {
              documents: {},
              transcripts: {},
            },
            format: "text" as TranscriptOutputFormat,
            job: {
              ...customJob,
              format: "text",
              id: "job-transcripts-1",
              kind: "transcripts",
              outputDir: "/tmp/custom-transcripts",
            },
            outputDir: "/tmp/custom-transcripts",
            scope: { mode: "all" },
            transcriptCount: 0,
            written: 0,
          };
        },
        async rerun(service, job) {
          return await service.exportTranscripts(job.format as TranscriptOutputFormat, {
            outputDir: job.outputDir,
          });
        },
      });

    const service = new GranolaExportService({
      config: createConfig(),
      createExportJobId: (kind) => `job-${kind}-custom`,
      emitStateUpdate: () => undefined,
      exporterRegistry,
      loadCache: async () => ({ documents: {}, transcripts: {} }),
      loadFolders: async () => [],
      listDocuments: async () => [],
      nowIso: () => "2024-03-01T12:00:00Z",
      state: {
        jobs: [],
      },
    });

    const result = await service.exportNotes("markdown");
    expect(result.outputDir).toBe("/tmp/custom-notes");
  });

  test("allows the app to source documents through a registered sync adapter", async () => {
    const document: GranolaDocument = {
      content: "Notes",
      createdAt: "2024-01-01T09:00:00Z",
      id: "doc-alpha-1111",
      notesPlain: "Notes",
      tags: ["team"],
      title: "Alpha Sync",
      updatedAt: "2024-01-03T10:00:00Z",
    };
    const syncAdapterRegistry = createGranolaSyncAdapterRegistry().register("granola", {
      kind: "granola",
      async createRuntime() {
        return {
          auth: authState,
          client: {
            listDocuments: async () => [document],
          },
        };
      },
    });

    const app = new GranolaApp(
      {
        ...createConfig(),
        transcripts: {
          cacheFile: "",
          output: "/tmp/transcripts",
        },
      },
      {
        auth: authState,
        cacheLoader: async () => undefined as CacheData | undefined,
        syncAdapterRegistry,
      },
      {
        surface: "cli",
      },
    );

    const meetings = await app.listMeetings({ limit: 10 });
    expect(meetings.meetings).toEqual([
      expect.objectContaining({
        id: "doc-alpha-1111",
        title: "Alpha Sync",
      }),
    ]);
  });
});
