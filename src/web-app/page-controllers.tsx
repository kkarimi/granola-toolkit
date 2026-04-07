/** @jsxImportSource solid-js */

import { For, Match, Show, Switch } from "solid-js";

import type {
  FolderSummaryRecord,
  GranolaAgentHarness,
  GranolaAgentHarnessMatchExplanation,
  GranolaAutomationActionRun,
  GranolaAutomationArtefact,
  GranolaAutomationArtefactKind,
  GranolaAutomationEvaluationRun,
  GranolaAppAuthMode,
  GranolaAppAuthState,
  GranolaAppPluginState,
  GranolaAppState,
  GranolaMeetingBundle,
  GranolaMeetingSort,
  MeetingRecord,
  MeetingSummaryRecord,
} from "../app/index.ts";
import type { GranolaReviewInboxItem, GranolaReviewInboxSummary } from "../review-inbox.ts";
import type { GranolaServerInfo } from "../transport.ts";
import type { GranolaAgentProviderKind } from "../types.ts";
import type { WebWorkspaceRecentMeeting, WorkspaceTab } from "../web/client-state.ts";

import {
  ArtefactReviewPanel,
  AuthPanel,
  BrowsePromptPanel,
  DiagnosticsPanel,
  ExportJobsPanel,
  FolderList,
  HomeDashboardPanel,
  IssueReviewPanel,
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
  onOpenFoldersPage: () => void;
  onOpenReviewPage: () => void;
  onOpenSearchPage: () => void;
  processingIssues: import("../app/index.ts").GranolaProcessingIssue[];
  recentMeetings: WebWorkspaceRecentMeeting[];
  reviewSummary: ReviewSummary;
  serverInfo: GranolaServerInfo | null;
}) {
  return (
    <>
      <PageHeader
        description="Latest meetings, sync health, and what needs attention."
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
  onExportNotes: () => void;
  onExportTranscripts: () => void;
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
        description="Find a meeting by title, notes, transcript, folder, or tag."
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
  onSaveArtefact: () => void;
  onSelectItem: (key: string) => void;
  reviewItems: ReviewItems;
  reviewNote: string;
  reviewSummary: ReviewSummary;
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
            Refresh review state
          </button>
        }
        description="Review approvals, artefacts, and processing issues in one place instead of mixing them into the meeting page."
        eyebrow="Review"
        title="Review queue"
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
                markdownViewerEnabled={props.markdownViewerEnabled}
                onApprove={() => props.onApproveArtefact()}
                onDraftMarkdownChange={(value) => props.onDraftMarkdownChange(value)}
                onDraftSummaryChange={(value) => props.onDraftSummaryChange(value)}
                onDraftTitleChange={(value) => props.onDraftTitleChange(value)}
                onReject={() => props.onRejectArtefact()}
                onRerun={() => props.onRerunArtefact()}
                onReviewNoteChange={(value) => props.onReviewNoteChange(value)}
                onSave={() => props.onSaveArtefact()}
                reviewNote={props.reviewNote}
              />
            </Match>
            <Match when={true}>
              <div class="empty">Select something from the review inbox to inspect it.</div>
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
  onDuplicateHarness: () => void;
  onExportNotes: () => void;
  onExportTranscripts: () => void;
  onImportDesktopSession: () => void;
  onLock: () => void;
  onLogout: () => void;
  onNewHarness: () => void;
  onOpenMeeting: (meetingId: string) => void;
  onPasswordChange: (value: string) => void;
  onRecover: (issueId: string) => void;
  onRefreshAuth: () => void;
  onRejectRun: (runId: string) => void;
  onReloadHarnesses: () => void;
  onRemoveHarness: () => void;
  onRerunJob: (jobId: string) => void;
  onSaveApiKey: () => void;
  onSaveHarnesses: () => void;
  onSelectHarness: (id: string) => void;
  onTogglePlugin: (id: string, enabled: boolean) => void;
  onSwitchMode: (mode: GranolaAppAuthMode) => void;
  onTestHarness: () => void;
  onTestKindChange: (kind: GranolaAutomationArtefactKind) => void;
  onUnlock: () => void;
  password: string;
  preferredProvider: GranolaAgentProviderKind;
  processingIssues: import("../app/index.ts").GranolaProcessingIssue[];
  plugins: GranolaAppPluginState[];
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
    { id: "auth", label: "Auth" },
    { id: "plugins", label: "Plugins" },
    { id: "exports", label: "Exports" },
    { id: "diagnostics", label: "Diagnostics" },
  ];

  return (
    <>
      <PageHeader
        description="Settings holds auth, optional plugins, export history, and diagnostics so the rest of the app can stay focused on browsing and reading."
        eyebrow="Settings"
        title="Service settings"
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
                onImportDesktopSession={() => props.onImportDesktopSession()}
                onLogout={() => props.onLogout()}
                onRefresh={() => props.onRefreshAuth()}
                onSaveApiKey={() => props.onSaveApiKey()}
                onSwitchMode={(mode) => props.onSwitchMode(mode)}
                preferredProvider={props.preferredProvider}
              />
            </Match>
            <Match when={props.settingsTab === "plugins"}>
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
            </Match>
            <Match when={props.settingsTab === "exports"}>
              <section class="settings-export-actions">
                <div class="toolbar-actions">
                  <button
                    class="button button--secondary"
                    onClick={() => props.onExportNotes()}
                    type="button"
                  >
                    Export notes
                  </button>
                  <button
                    class="button button--secondary"
                    onClick={() => props.onExportTranscripts()}
                    type="button"
                  >
                    Export transcripts
                  </button>
                </div>
              </section>
              <ExportJobsPanel
                jobs={props.appState?.exports.jobs || []}
                onRerun={(jobId) => props.onRerunJob(jobId)}
              />
            </Match>
            <Match when={props.settingsTab === "diagnostics"}>
              <DiagnosticsPanel
                appState={props.appState}
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
