/** @jsxImportSource solid-js */

import { For, Match, Switch, type JSX } from "solid-js";

import type {
  GranolaAgentHarness,
  GranolaAgentHarnessMatchExplanation,
  GranolaAutomationActionRun,
  GranolaAutomationArtefactKind,
  GranolaAutomationEvaluationRun,
  GranolaAppPluginState,
  GranolaProcessingIssue,
  GranolaSyncEventKind,
  MeetingRecord,
} from "../app/index.ts";
import { pluginSettingsContributions } from "../app/plugin-state.ts";
import type { GranolaPluginSettingsSection } from "../plugin-registry.ts";

import { HarnessEditorPanel } from "./harness-editor.tsx";
import { AutomationRunsPanel, ProcessingIssuesPanel } from "./review-components.tsx";

export interface PluginSettingsContributionPanelsProps {
  automationRuns: GranolaAutomationActionRun[];
  harnessDirty: boolean;
  harnessError: string;
  harnessExplanations: GranolaAgentHarnessMatchExplanation[];
  harnessExplanationEventKind: GranolaSyncEventKind | null;
  harnesses: GranolaAgentHarness[];
  onApproveRun: (runId: string) => void;
  onChangeHarness: (harness: GranolaAgentHarness) => void;
  onDuplicateHarness: () => void;
  onNewHarness: () => void;
  onOpenMeeting: (meetingId: string) => void;
  onRecover: (issueId: string) => void;
  onRejectRun: (runId: string) => void;
  onReloadHarnesses: () => void;
  onRemoveHarness: () => void;
  onSaveHarnesses: () => void;
  onSelectHarness: (id: string) => void;
  onTestHarness: () => void;
  onTestKindChange: (kind: GranolaAutomationArtefactKind) => void;
  plugins: GranolaAppPluginState[];
  processingIssues: GranolaProcessingIssue[];
  section: GranolaPluginSettingsSection;
  selectedHarness: GranolaAgentHarness | null;
  selectedHarnessId: string | null;
  selectedMeeting: MeetingRecord | null;
  testKind: GranolaAutomationArtefactKind;
  testResult: GranolaAutomationEvaluationRun | null;
}

export function PluginSettingsContributionPanels(
  props: PluginSettingsContributionPanelsProps,
): JSX.Element {
  const contributions = () => pluginSettingsContributions(props.plugins, props.section);

  return (
    <For each={contributions()}>
      {({ contribution }) => (
        <Switch>
          <Match when={contribution.id === "automation-harness-editor"}>
            <HarnessEditorPanel
              dirty={props.harnessDirty}
              error={props.harnessError}
              explanations={props.harnessExplanations}
              explanationEventKind={props.harnessExplanationEventKind}
              harnesses={props.harnesses}
              onChange={(harness) => props.onChangeHarness(harness)}
              onDuplicate={() => props.onDuplicateHarness()}
              onNew={() => props.onNewHarness()}
              onReload={() => props.onReloadHarnesses()}
              onRemove={() => props.onRemoveHarness()}
              onSave={() => props.onSaveHarnesses()}
              onSelect={(id) => props.onSelectHarness(id)}
              onTest={() => props.onTestHarness()}
              onTestKindChange={(kind) => props.onTestKindChange(kind)}
              selectedHarness={props.selectedHarness}
              selectedHarnessId={props.selectedHarnessId}
              selectedMeeting={props.selectedMeeting}
              testKind={props.testKind}
              testResult={props.testResult}
            />
          </Match>
          <Match when={contribution.id === "automation-review-diagnostics"}>
            <>
              <ProcessingIssuesPanel
                issues={props.processingIssues}
                onOpenMeeting={(meetingId) => props.onOpenMeeting(meetingId)}
                onRecover={(issueId) => props.onRecover(issueId)}
              />
              <AutomationRunsPanel
                onApprove={(runId) => props.onApproveRun(runId)}
                onReject={(runId) => props.onRejectRun(runId)}
                runs={props.automationRuns}
              />
            </>
          </Match>
        </Switch>
      )}
    </For>
  );
}
