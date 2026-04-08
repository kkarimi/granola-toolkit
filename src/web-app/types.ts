import type {
  FolderSummaryRecord,
  GranolaAgentHarness,
  GranolaAgentHarnessMatchExplanation,
  GranolaAutomationActionRun,
  GranolaAutomationArtefact,
  GranolaAutomationArtefactKind,
  GranolaAutomationEvaluationRun,
  GranolaAutomationRule,
  GranolaAppState,
  GranolaExportTarget,
  GranolaMeetingBundle,
  GranolaMeetingSort,
  GranolaSyncEventKind,
  MeetingRecord,
  MeetingSummaryRecord,
  MeetingSummarySource,
} from "../app/index.ts";
import type { GranolaAgentProviderKind } from "../types.ts";
import type { GranolaServerInfo } from "../transport.ts";

import type { WebMainPage, WebSettingsSection, WebStatusTone } from "./components.tsx";
import type { WebWorkspacePreferences, WorkspaceTab } from "../web/client-state.ts";

export type MeetingReturnPage = Exclude<WebMainPage, "meeting">;
export type GranolaWebExportMode = "both" | "notes" | "transcripts";

export interface GranolaWebBrowserConfig {
  passwordRequired: boolean;
}

export interface GranolaWebAppState {
  activePage: WebMainPage;
  apiKeyDraft: string;
  advancedSearchQuery: string;
  automationArtefactDraftMarkdown: string;
  automationArtefactDraftSummary: string;
  automationArtefactDraftTitle: string;
  automationArtefactError: string;
  automationArtefacts: GranolaAutomationArtefact[];
  automationRules: GranolaAutomationRule[];
  automationRuns: GranolaAutomationActionRun[];
  appState: GranolaAppState | null;
  detailError: string;
  exportMode: GranolaWebExportMode;
  exportTargets: GranolaExportTarget[];
  folderError: string;
  folders: FolderSummaryRecord[];
  foldersLoading: boolean;
  harnessDirty: boolean;
  harnessError: string;
  harnessExplainEventKind: GranolaSyncEventKind | null;
  harnessExplanations: GranolaAgentHarnessMatchExplanation[];
  harnesses: GranolaAgentHarness[];
  harnessTestKind: GranolaAutomationArtefactKind;
  harnessTestResult: GranolaAutomationEvaluationRun | null;
  homeMeetings: MeetingSummaryRecord[];
  homeMeetingsError: string;
  listError: string;
  homeMeetingsLoading: boolean;
  meetingLoading: boolean;
  meetingReturnPage: MeetingReturnPage;
  meetings: MeetingSummaryRecord[];
  meetingsLoading: boolean;
  meetingSource: MeetingSummarySource;
  preferredProvider: GranolaAgentProviderKind;
  processingIssueError: string;
  processingIssues: import("../app/index.ts").GranolaProcessingIssue[];
  recentMeetings: WebWorkspacePreferences["recentMeetings"];
  reviewNote: string;
  savedFilters: WebWorkspacePreferences["savedFilters"];
  search: string;
  searchSubmitted: boolean;
  selectedAutomationArtefactId: string | null;
  selectedExportTargetId: string | null;
  selectedFolderId: string | null;
  selectedHarnessId: string | null;
  selectedMeeting: MeetingRecord | null;
  selectedMeetingBundle: GranolaMeetingBundle | null;
  selectedMeetingId: string | null;
  selectedReviewInboxKey: string | null;
  serverInfo: GranolaServerInfo | null;
  serverLocked: boolean;
  serverPassword: string;
  settingsTab: WebSettingsSection;
  sort: GranolaMeetingSort;
  statusLabel: string;
  statusTone: WebStatusTone;
  updatedFrom: string;
  updatedTo: string;
  workspaceTab: WorkspaceTab;
}
