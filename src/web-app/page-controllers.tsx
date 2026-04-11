/** @jsxImportSource solid-js */

import { For, Match, Show, Switch } from "solid-js";

import type {
  FolderSummaryRecord,
  GranolaAgentHarness,
  GranolaAgentHarnessMatchExplanation,
  GranolaAutomationActionRun,
  GranolaAutomationArtefact,
  GranolaAutomationArtefactPublishPreviewResult,
  GranolaAutomationArtefactKind,
  GranolaAutomationEvaluationRun,
  GranolaAppAuthMode,
  GranolaAppAuthState,
  GranolaAppPluginState,
  GranolaAppState,
  GranolaExportTarget,
  GranolaMeetingBundle,
  GranolaMeetingSort,
  MeetingRecord,
  MeetingSummaryRecord,
} from "../app/index.ts";
import type { GranolaReviewInboxItem, GranolaReviewInboxSummary } from "../review-inbox.ts";
import type { GranolaServerInfo } from "../transport.ts";
import type { WebWorkspaceRecentMeeting, WorkspaceTab } from "../web/client-state.ts";
import type { GranolaWebExportMode } from "./types.ts";

import {
  ArtefactReviewPanel,
  AuthPanel,
  BrowsePromptPanel,
  DiagnosticsPanel,
  FolderList,
  HomeDashboardPanel,
  IssueReviewPanel,
  KnowledgeBasesPanel,
  MeetingList,
  PageHeader,
  PluginsPanel,
  ReviewInboxPanel,
  RunReviewPanel,
  SearchWorkspacePanel,
  SecurityPanel,
  type WebSettingsSection,
} from "./components.tsx";
import { Workspace } from "./components.tsx";
import { PluginSettingsContributionPanels } from "./plugin-settings-contributions.tsx";

type ReviewItems = GranolaReviewInboxItem[];
type ReviewSummary = GranolaReviewInboxSummary;

export function HomePageController(props: {
  appState: GranolaAppState | null;
  automationEnabled: boolean;
  folders: FolderSummaryRecord[];
  foldersLoading: boolean;
  latestMeetings: MeetingSummaryRecord[];
  latestMeetingsLoading: boolean;
  onOpenFolder: (folderId: string) => void;
  onOpenLatestMeeting: (meeting: MeetingSummaryRecord) => void;
  onOpenMeeting: (meeting: WebWorkspaceRecentMeeting) => void;
  onOpenReviewPage: () => void;
  processingIssues: import("../app/index.ts").GranolaProcessingIssue[];
  recentMeetings: WebWorkspaceRecentMeeting[];
  reviewSummary: ReviewSummary;
  serverInfo: GranolaServerInfo | null;
}) {
  return (
    <>
      <PageHeader
        description="Latest meetings, last sync, and what needs attention."
        eyebrow="Home"
        title="Home"
      />
      <HomeDashboardPanel
        appState={props.appState}
        automationEnabled={props.automationEnabled}
        folders={props.folders}
        foldersLoading={props.foldersLoading}
        latestMeetings={props.latestMeetings}
        latestMeetingsLoading={props.latestMeetingsLoading}
        onOpenFolder={(folderId) => {
          props.onOpenFolder(folderId);
        }}
        onOpenLatestMeeting={(meeting) => {
          props.onOpenLatestMeeting(meeting);
        }}
        onOpenMeeting={(meeting) => {
          props.onOpenMeeting(meeting);
        }}
        onOpenReview={() => {
          props.onOpenReviewPage();
        }}
        processingIssues={props.processingIssues}
        recentMeetings={props.recentMeetings}
        reviewSummary={props.reviewSummary}
        serverInfo={props.serverInfo}
      />
    </>
  );
}

export function FoldersPageController(props: {
  directoryFreshnessNote?: string;
  folderError: string;
  folders: FolderSummaryRecord[];
  foldersLoading: boolean;
  listError: string;
  meetingFreshnessNote?: string;
  meetingEmptyHint: string;
  meetings: MeetingSummaryRecord[];
  meetingsLoading: boolean;
  onBackToFolders: () => void;
  onOpenMeeting: (meetingId: string) => void;
  onRefreshFolders: () => void;
  onSelectFolder: (folderId: string) => void;
  selectedFolder: FolderSummaryRecord | null;
  selectedFolderId: string | null;
  selectedMeetingId: string | null;
}) {
  return (
    <>
      <PageHeader
        actions={
          <>
            <Show when={props.selectedFolderId}>
              <button
                class="button button--secondary"
                onClick={() => props.onBackToFolders()}
                type="button"
              >
                All folders
              </button>
            </Show>
          </>
        }
        description={
          props.selectedFolder
            ? `${props.selectedFolder.documentCount ?? 0} meetings in ${props.selectedFolder.name || props.selectedFolder.id}.`
            : "Choose one folder to open its meetings."
        }
        eyebrow="Folders"
        title={props.selectedFolder?.name || "Folders"}
      />
      <Show
        when={props.selectedFolderId}
        fallback={
          <FolderList
            error={props.folderError}
            folders={props.folders}
            freshnessNote={props.directoryFreshnessNote}
            loading={props.foldersLoading}
            onSelect={(folderId) => {
              if (folderId) {
                props.onSelectFolder(folderId);
              }
            }}
            selectedFolderId={props.selectedFolderId}
          />
        }
      >
        <MeetingList
          description={
            props.selectedFolder
              ? `${props.selectedFolder.documentCount ?? 0} meetings.`
              : "Choose a folder to load its meetings."
          }
          error={props.listError}
          emptyHint={props.meetingEmptyHint}
          folders={props.folders}
          freshnessNote={props.meetingFreshnessNote}
          heading="Meetings"
          loading={props.meetingsLoading}
          meetings={props.meetings}
          onSelect={(meetingId) => {
            props.onOpenMeeting(meetingId);
          }}
          search=""
          selectedFolderId={props.selectedFolderId}
          selectedMeetingId={props.selectedMeetingId}
          updatedFrom=""
          updatedTo=""
        />
      </Show>
    </>
  );
}

export function SearchPageController(props: {
  advancedQuery: string;
  folders: FolderSummaryRecord[];
  freshnessNote?: string;
  hasRecentMeetings: boolean;
  listError: string;
  meetingEmptyHint: string;
  meetings: MeetingSummaryRecord[];
  meetingsLoading: boolean;
  onAdvancedQueryChange: (value: string) => void;
  onClear: () => void;
  onOpenAdvanced: () => void;
  onOpenMeeting: (meetingId: string) => void;
  onQueryChange: (value: string) => void;
  onRun: () => void;
  onSortChange: (value: GranolaMeetingSort) => void;
  onUpdatedFromChange: (value: string) => void;
  onUpdatedToChange: (value: string) => void;
  query: string;
  searchResultsVisible: boolean;
  selectedFolderId: string | null;
  selectedMeetingId: string | null;
  sort: GranolaMeetingSort;
  updatedFrom: string;
  updatedTo: string;
}) {
  return (
    <>
      <PageHeader
        description="Find a meeting by title, notes, transcript text, folder, or tag."
        eyebrow="Search"
        title="Search"
      />
      <SearchWorkspacePanel
        advancedQuery={props.advancedQuery}
        onAdvancedQueryChange={(value) => props.onAdvancedQueryChange(value)}
        onClear={() => props.onClear()}
        onOpenAdvanced={() => props.onOpenAdvanced()}
        onQueryChange={(value) => props.onQueryChange(value)}
        onRun={() => props.onRun()}
        onSortChange={(value) => props.onSortChange(value)}
        onUpdatedFromChange={(value) => props.onUpdatedFromChange(value)}
        onUpdatedToChange={(value) => props.onUpdatedToChange(value)}
        query={props.query}
        sort={props.sort}
        updatedFrom={props.updatedFrom}
        updatedTo={props.updatedTo}
      />
      <Show
        when={props.searchResultsVisible}
        fallback={
          <BrowsePromptPanel
            foldersAvailable={props.folders.length}
            hasRecentMeetings={props.hasRecentMeetings}
          />
        }
      >
        <MeetingList
          description={
            props.query
              ? `Results for "${props.query}".`
              : "Filtered results from your local meeting index."
          }
          error={props.listError}
          emptyHint={props.meetingEmptyHint}
          folders={props.folders}
          freshnessNote={props.freshnessNote}
          heading="Search results"
          loading={props.meetingsLoading}
          meetings={props.meetings}
          onSelect={(meetingId) => props.onOpenMeeting(meetingId)}
          search={props.query}
          selectedFolderId={props.selectedFolderId}
          selectedMeetingId={props.selectedMeetingId}
          updatedFrom={props.updatedFrom}
          updatedTo={props.updatedTo}
        />
      </Show>
    </>
  );
}

export function ReviewPageController(props: {
  artefactDraftMarkdown: string;
  artefactDraftSummary: string;
  artefactDraftTitle: string;
  artefactError: string;
  artefactPublishPreview: GranolaAutomationArtefactPublishPreviewResult | null;
  artefactPublishPreviewError: string;
  artefactPublishPreviewLoading: boolean;
  markdownViewerEnabled: boolean;
  onApproveArtefact: () => void;
  onApproveRun: (runId: string) => void;
  onDraftMarkdownChange: (value: string) => void;
  onDraftSummaryChange: (value: string) => void;
  onDraftTitleChange: (value: string) => void;
  onOpenMeeting: (meetingId: string) => void;
  onRecover: (issueId: string) => void;
  onRefresh: () => void;
  onRejectArtefact: () => void;
  onRejectRun: (runId: string) => void;
  onRerunArtefact: () => void;
  onReviewNoteChange: (value: string) => void;
  onSelectPublishTarget: (targetId: string | null) => void;
  onSaveArtefact: () => void;
  onSelectItem: (key: string) => void;
  reviewItems: ReviewItems;
  reviewNote: string;
  reviewSummary: ReviewSummary;
  selectedPkmTargetId: string | null;
  selectedArtefact: GranolaAutomationArtefact | null;
  selectedBundle: GranolaMeetingBundle | null;
  selectedIssue: import("../app/index.ts").GranolaProcessingIssue | null;
  selectedKey: string | null;
  selectedRun: GranolaAutomationActionRun | null;
  selectedKind?: ReviewItems[number]["kind"];
}) {
  return (
    <>
      <PageHeader
        actions={
          <button class="button button--secondary" onClick={() => props.onRefresh()} type="button">
            Refresh
          </button>
        }
        description="Advanced drafts and recoveries for generated notes, approvals, and broken automation runs."
        eyebrow="Advanced"
        title="Drafts and recoveries"
      />
      <div class="review-layout">
        <section class="review-layout__sidebar">
          <ReviewInboxPanel
            items={props.reviewItems}
            onSelect={(key) => props.onSelectItem(key)}
            selectedKey={props.selectedKey}
            summary={props.reviewSummary}
          />
        </section>
        <section class="review-layout__main">
          <Switch>
            <Match when={props.selectedKind === "issue"}>
              <IssueReviewPanel
                issue={props.selectedIssue}
                onOpenMeeting={(meetingId) => props.onOpenMeeting(meetingId)}
                onRecover={(issueId) => props.onRecover(issueId)}
              />
            </Match>
            <Match when={props.selectedKind === "run"}>
              <RunReviewPanel
                onApprove={(runId) => props.onApproveRun(runId)}
                onOpenMeeting={(meetingId) => props.onOpenMeeting(meetingId)}
                onReject={(runId) => props.onRejectRun(runId)}
                run={props.selectedRun}
              />
            </Match>
            <Match when={props.selectedKind === "artefact"}>
              <ArtefactReviewPanel
                artefact={props.selectedArtefact}
                bundle={props.selectedBundle}
                draftMarkdown={props.artefactDraftMarkdown}
                draftSummary={props.artefactDraftSummary}
                draftTitle={props.artefactDraftTitle}
                error={props.artefactError}
                publishPreview={props.artefactPublishPreview}
                publishPreviewError={props.artefactPublishPreviewError}
                publishPreviewLoading={props.artefactPublishPreviewLoading}
                markdownViewerEnabled={props.markdownViewerEnabled}
                onApprove={() => props.onApproveArtefact()}
                onDraftMarkdownChange={(value) => props.onDraftMarkdownChange(value)}
                onDraftSummaryChange={(value) => props.onDraftSummaryChange(value)}
                onDraftTitleChange={(value) => props.onDraftTitleChange(value)}
                onReject={() => props.onRejectArtefact()}
                onRerun={() => props.onRerunArtefact()}
                onReviewNoteChange={(value) => props.onReviewNoteChange(value)}
                onSelectPublishTarget={(targetId) => props.onSelectPublishTarget(targetId)}
                onSave={() => props.onSaveArtefact()}
                reviewNote={props.reviewNote}
                selectedPublishTargetId={props.selectedPkmTargetId}
              />
            </Match>
            <Match when={true}>
              <div class="empty">Select something from the inbox to inspect it.</div>
            </Match>
          </Switch>
        </section>
      </div>
    </>
  );
}

export function SettingsPageController(props: {
  apiKeyDraft: string;
  appState: GranolaAppState | null;
  auth: GranolaAppAuthState | undefined;
  automationRuns: GranolaAutomationActionRun[];
  automationEnabled: boolean;
  harnessDirty: boolean;
  harnessError: string;
  harnessExplanations: GranolaAgentHarnessMatchExplanation[];
  harnessExplanationEventKind: import("../app/index.ts").GranolaSyncEventKind | null;
  harnesses: GranolaAgentHarness[];
  harnessTestKind: GranolaAutomationArtefactKind;
  harnessTestResult: GranolaAutomationEvaluationRun | null;
  onApiKeyDraftChange: (value: string) => void;
  onApproveRun: (runId: string) => void;
  onChangeHarness: (harness: GranolaAgentHarness) => void;
  onClearApiKey: () => void;
  currentExportScopeLabel: string;
  onDuplicateHarness: () => void;
  exportDestinationSummary: string;
  defaultArchiveSummary: string;
  exportMode: GranolaWebExportMode;
  exportTargets: GranolaExportTarget[];
  onImportDesktopSession: () => void;
  onLock: () => void;
  onLogout: () => void;
  onNewHarness: () => void;
  onOpenMeeting: (meetingId: string) => void;
  onOpenReviewPage: () => void;
  onPasswordChange: (value: string) => void;
  onRecover: (issueId: string) => void;
  onRefreshAuth: () => void;
  onRejectRun: (runId: string) => void;
  onReloadHarnesses: () => void;
  onRemoveHarness: () => void;
  onRerunJob: (jobId: string) => void;
  onRunExport: () => void;
  onSaveApiKey: () => void;
  onSaveKnowledgeBase: (target: GranolaExportTarget) => void;
  onSaveHarnesses: () => void;
  onSelectExportTarget: (id: string | null) => void;
  onSelectHarness: (id: string) => void;
  onTogglePlugin: (id: string, enabled: boolean) => void;
  onExportModeChange: (mode: GranolaWebExportMode) => void;
  onSwitchMode: (mode: GranolaAppAuthMode) => void;
  onTestHarness: () => void;
  onTestKindChange: (kind: GranolaAutomationArtefactKind) => void;
  onUnlock: () => void;
  onRemoveKnowledgeBase: (id: string) => void;
  password: string;
  processingIssues: import("../app/index.ts").GranolaProcessingIssue[];
  plugins: GranolaAppPluginState[];
  reviewSummary: ReviewSummary;
  selectedExportTargetId: string | null;
  selectedHarness: GranolaAgentHarness | null;
  selectedHarnessId: string | null;
  selectedMeeting: MeetingRecord | null;
  serverInfo: GranolaServerInfo | null;
  serverLocked: boolean;
  settingsTab: WebSettingsSection;
  setSettingsTab: (tab: WebSettingsSection) => void;
  statusLabel: string;
}) {
  const settingsTabs: Array<{ id: WebSettingsSection; label: string }> = [
    { id: "auth", label: "Connection" },
    { id: "knowledge", label: "Knowledge bases" },
    { id: "diagnostics", label: "Advanced" },
  ];

  return (
    <>
      <PageHeader
        description="Manage how Gran connects, publishes into local knowledge bases, and handles advanced local runtime controls."
        eyebrow="Settings"
        title="Settings"
      />
      <section class="settings-shell">
        <nav class="settings-shell__tabs">
          <For each={settingsTabs}>
            {(tab) => (
              <button
                class="workspace-tab"
                data-selected={props.settingsTab === tab.id ? "true" : undefined}
                onClick={() => props.setSettingsTab(tab.id)}
                type="button"
              >
                {tab.label}
              </button>
            )}
          </For>
        </nav>
        <div class="settings-shell__body">
          <Switch>
            <Match when={props.settingsTab === "auth"}>
              <SecurityPanel
                onLock={() => props.onLock()}
                onPasswordChange={(value) => props.onPasswordChange(value)}
                onUnlock={() => props.onUnlock()}
                password={props.password}
                visible={props.serverLocked}
              />
              <AuthPanel
                apiKeyDraft={props.apiKeyDraft}
                auth={props.auth}
                onApiKeyDraftChange={(value) => props.onApiKeyDraftChange(value)}
                onClearApiKey={() => props.onClearApiKey()}
                onImportDesktopSession={() => props.onImportDesktopSession()}
                onLogout={() => props.onLogout()}
                onRefresh={() => props.onRefreshAuth()}
                onSaveApiKey={() => props.onSaveApiKey()}
                onSwitchMode={(mode) => props.onSwitchMode(mode)}
              />
            </Match>
            <Match when={props.settingsTab === "knowledge"}>
              <KnowledgeBasesPanel
                currentScopeLabel={props.currentExportScopeLabel}
                defaultArchiveSummary={props.defaultArchiveSummary}
                exportDestinationSummary={props.exportDestinationSummary}
                exportMode={props.exportMode}
                jobs={props.appState?.exports.jobs || []}
                onExportModeChange={(mode) => props.onExportModeChange(mode)}
                onRemoveKnowledgeBase={(id) => props.onRemoveKnowledgeBase(id)}
                onRerun={(jobId) => props.onRerunJob(jobId)}
                onRunExport={() => props.onRunExport()}
                onSaveKnowledgeBase={(target) => props.onSaveKnowledgeBase(target)}
                onSelectTarget={(id) => props.onSelectExportTarget(id)}
                selectedTargetId={props.selectedExportTargetId}
                targets={props.exportTargets}
              />
            </Match>
            <Match when={props.settingsTab === "diagnostics"}>
              <PluginsPanel
                onTogglePlugin={(id, enabled) => props.onTogglePlugin(id, enabled)}
                plugins={props.plugins}
              />
              <PluginSettingsContributionPanels
                automationRuns={props.automationRuns}
                harnessDirty={props.harnessDirty}
                harnessError={props.harnessError}
                harnessExplanations={props.harnessExplanations}
                harnessExplanationEventKind={props.harnessExplanationEventKind}
                harnesses={props.harnesses}
                onApproveRun={(runId) => props.onApproveRun(runId)}
                onChangeHarness={(harness) => props.onChangeHarness(harness)}
                onDuplicateHarness={() => props.onDuplicateHarness()}
                onNewHarness={() => props.onNewHarness()}
                onOpenMeeting={(meetingId) => props.onOpenMeeting(meetingId)}
                onRecover={(issueId) => props.onRecover(issueId)}
                onRejectRun={(runId) => props.onRejectRun(runId)}
                onReloadHarnesses={() => props.onReloadHarnesses()}
                onRemoveHarness={() => props.onRemoveHarness()}
                onSaveHarnesses={() => props.onSaveHarnesses()}
                onSelectHarness={(id) => props.onSelectHarness(id)}
                onTestHarness={() => props.onTestHarness()}
                onTestKindChange={(kind) => props.onTestKindChange(kind)}
                plugins={props.plugins}
                processingIssues={props.processingIssues}
                section="plugins"
                selectedHarness={props.selectedHarness}
                selectedHarnessId={props.selectedHarnessId}
                selectedMeeting={props.selectedMeeting}
                testKind={props.harnessTestKind}
                testResult={props.harnessTestResult}
              />
              <DiagnosticsPanel
                appState={props.appState}
                automationEnabled={props.automationEnabled}
                onOpenReviewPage={() => props.onOpenReviewPage()}
                reviewSummary={props.reviewSummary}
                serverInfo={props.serverInfo}
                statusLabel={props.statusLabel}
              />
              <PluginSettingsContributionPanels
                automationRuns={props.automationRuns}
                harnessDirty={props.harnessDirty}
                harnessError={props.harnessError}
                harnessExplanations={props.harnessExplanations}
                harnessExplanationEventKind={props.harnessExplanationEventKind}
                harnesses={props.harnesses}
                onApproveRun={(runId) => props.onApproveRun(runId)}
                onChangeHarness={(harness) => props.onChangeHarness(harness)}
                onDuplicateHarness={() => props.onDuplicateHarness()}
                onNewHarness={() => props.onNewHarness()}
                onOpenMeeting={(meetingId) => props.onOpenMeeting(meetingId)}
                onRecover={(issueId) => props.onRecover(issueId)}
                onRejectRun={(runId) => props.onRejectRun(runId)}
                onReloadHarnesses={() => props.onReloadHarnesses()}
                onRemoveHarness={() => props.onRemoveHarness()}
                onSaveHarnesses={() => props.onSaveHarnesses()}
                onSelectHarness={(id) => props.onSelectHarness(id)}
                onTestHarness={() => props.onTestHarness()}
                onTestKindChange={(kind) => props.onTestKindChange(kind)}
                plugins={props.plugins}
                processingIssues={props.processingIssues}
                section="diagnostics"
                selectedHarness={props.selectedHarness}
                selectedHarnessId={props.selectedHarnessId}
                selectedMeeting={props.selectedMeeting}
                testKind={props.harnessTestKind}
                testResult={props.harnessTestResult}
              />
            </Match>
          </Switch>
        </div>
      </section>
    </>
  );
}

export function MeetingPageController(props: {
  detailError: string;
  freshnessNote?: string;
  meetingLoading: boolean;
  markdownViewerEnabled: boolean;
  meetingDescription: string;
  meetingReturnLabel: string;
  onBack: () => void;
  onSelectTab: (tab: WorkspaceTab) => void;
  selectedBundle: GranolaMeetingBundle | null;
  selectedMeeting: MeetingRecord | null;
  selectedMeetingId: string | null;
  workspaceTab: WorkspaceTab;
}) {
  return (
    <>
      <PageHeader
        actions={
          <button class="button button--secondary" onClick={() => props.onBack()} type="button">
            {props.meetingReturnLabel}
          </button>
        }
        description={props.meetingDescription}
        eyebrow="Meeting"
        title={props.selectedMeeting?.meeting.title || props.selectedMeetingId || "Meeting"}
      />
      <Show when={props.freshnessNote}>{(note) => <p class="page-note">{note()}</p>}</Show>
      <Workspace
        bundle={props.selectedBundle}
        detailError={props.detailError}
        loading={props.meetingLoading}
        markdownViewerEnabled={props.markdownViewerEnabled}
        onSelectTab={(tab) => props.onSelectTab(tab)}
        selectedMeeting={props.selectedMeeting}
        tab={props.workspaceTab}
      />
    </>
  );
}
