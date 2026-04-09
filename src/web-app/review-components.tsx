/** @jsxImportSource solid-js */

import { For, Show, type JSX } from "solid-js";

import type {
  GranolaAutomationActionRun,
  GranolaAutomationArtefact,
  GranolaAutomationArtefactPublishPreviewResult,
  GranolaMeetingBundle,
  GranolaProcessingIssue,
} from "../app/index.ts";
import type { GranolaReviewInboxItem, GranolaReviewInboxSummary } from "../review-inbox.ts";
import { MarkdownDocument } from "./markdown-viewer.tsx";

interface AutomationRunsPanelProps {
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  runs: GranolaAutomationActionRun[];
}

interface ProcessingIssuesPanelProps {
  issues: GranolaProcessingIssue[];
  onOpenMeeting: (meetingId: string) => void;
  onRecover: (id: string) => void;
}

interface AutomationArtefactsPanelProps {
  artefacts: GranolaAutomationArtefact[];
  onSelect: (id: string) => void;
  selectedArtefactId?: string | null;
}

interface ReviewInboxPanelProps {
  items: GranolaReviewInboxItem[];
  onSelect: (key: string) => void;
  selectedKey?: string | null;
  summary: GranolaReviewInboxSummary;
}

interface ArtefactReviewPanelProps {
  artefact: GranolaAutomationArtefact | null;
  bundle: GranolaMeetingBundle | null;
  draftMarkdown: string;
  draftSummary: string;
  draftTitle: string;
  error?: string;
  markdownViewerEnabled: boolean;
  onApprove: () => void;
  onDraftMarkdownChange: (value: string) => void;
  onDraftSummaryChange: (value: string) => void;
  onDraftTitleChange: (value: string) => void;
  onReject: () => void;
  onRerun: () => void;
  onReviewNoteChange: (value: string) => void;
  onSelectPublishTarget: (targetId: string | null) => void;
  onSave: () => void;
  publishPreview: GranolaAutomationArtefactPublishPreviewResult | null;
  publishPreviewError?: string;
  publishPreviewLoading: boolean;
  reviewNote: string;
  selectedPublishTargetId: string | null;
}

function artefactAttemptSummary(artefact: GranolaAutomationArtefact): string {
  if (artefact.attempts.length === 0) {
    return "No attempt metadata recorded";
  }

  return artefact.attempts
    .map((attempt) => {
      const parts = [attempt.provider, attempt.model, attempt.harnessId].filter(Boolean);
      return parts.length > 0 ? parts.join(" · ") : "Attempt";
    })
    .join(" / ");
}

function publishPreviewEntries(preview: GranolaAutomationArtefactPublishPreviewResult | null) {
  if (!preview?.preview) {
    return [];
  }

  return [
    {
      key: "note",
      label: "Meeting note",
      openUrl: preview.preview.noteOpenUrl,
      path: preview.preview.noteFilePath,
    },
    ...(preview.preview.transcriptFilePath
      ? [
          {
            key: "transcript",
            label: "Transcript",
            openUrl: preview.preview.transcriptOpenUrl,
            path: preview.preview.transcriptFilePath,
          },
        ]
      : []),
    ...(preview.preview.dailyNoteFilePath
      ? [
          {
            key: "daily-note",
            label: "Daily note",
            openUrl: preview.preview.dailyNoteOpenUrl,
            path: preview.preview.dailyNoteFilePath,
          },
        ]
      : []),
  ];
}

export function AutomationRunsPanel(props: AutomationRunsPanelProps): JSX.Element {
  return (
    <section class="jobs-panel">
      <div class="jobs-panel__head">
        <h3>Needs approval</h3>
        <p>Actions that paused and are waiting for a yes or no.</p>
      </div>
      <div class="jobs-list">
        <Show
          when={props.runs.length > 0}
          fallback={<div class="job-empty">Nothing is waiting for approval.</div>}
        >
          <For each={props.runs.slice(0, 6)}>
            {(run) => (
              <article class="job-card">
                <div class="job-card__head">
                  <div>
                    <div class="job-card__title">{run.actionName}</div>
                    <div class="job-card__meta">{`${run.ruleName} • ${run.id}`}</div>
                  </div>
                  <div class="job-card__status" data-status={run.status}>
                    {run.status}
                  </div>
                </div>
                <div class="job-card__meta">{`${run.title} • ${run.eventKind}`}</div>
                <div class="job-card__meta">{`Started: ${run.startedAt.slice(0, 19)}`}</div>
                <Show when={run.prompt}>
                  <div class="job-card__meta">{run.prompt}</div>
                </Show>
                <Show when={run.result}>
                  <div class="job-card__meta">{run.result}</div>
                </Show>
                <Show when={run.error}>
                  <div class="job-card__meta">{run.error}</div>
                </Show>
                <div class="job-card__actions">
                  <Show when={run.status === "pending"}>
                    <>
                      <button
                        class="button button--secondary"
                        onClick={() => {
                          props.onApprove(run.id);
                        }}
                        type="button"
                      >
                        Approve
                      </button>
                      <button
                        class="button button--secondary"
                        onClick={() => {
                          props.onReject(run.id);
                        }}
                        type="button"
                      >
                        Reject
                      </button>
                    </>
                  </Show>
                </div>
              </article>
            )}
          </For>
        </Show>
      </div>
    </section>
  );
}

export function ProcessingIssuesPanel(props: ProcessingIssuesPanelProps): JSX.Element {
  return (
    <section class="jobs-panel">
      <div class="jobs-panel__head">
        <h3>Needs recovery</h3>
        <p>Problems that need a retry, a transcript refresh, or a closer look.</p>
      </div>
      <div class="jobs-list">
        <Show
          when={props.issues.length > 0}
          fallback={<div class="job-empty">Nothing needs recovery right now.</div>}
        >
          <For each={props.issues.slice(0, 8)}>
            {(issue) => (
              <article class="job-card">
                <div class="job-card__head">
                  <div>
                    <div class="job-card__title">{issue.title}</div>
                    <div class="job-card__meta">{issue.id}</div>
                  </div>
                  <div class="job-card__status" data-status={issue.severity}>
                    {issue.severity}
                  </div>
                </div>
                <div class="job-card__meta">{issue.kind}</div>
                <div class="job-card__meta">{issue.detail}</div>
                <div class="job-card__actions">
                  <Show when={issue.meetingId}>
                    <button
                      class="button button--secondary"
                      onClick={() => {
                        props.onOpenMeeting(issue.meetingId!);
                      }}
                      type="button"
                    >
                      Open Meeting
                    </button>
                  </Show>
                  <Show when={issue.recoverable}>
                    <button
                      class="button button--secondary"
                      onClick={() => {
                        props.onRecover(issue.id);
                      }}
                      type="button"
                    >
                      Recover
                    </button>
                  </Show>
                </div>
              </article>
            )}
          </For>
        </Show>
      </div>
    </section>
  );
}

export function ReviewInboxPanel(props: ReviewInboxPanelProps): JSX.Element {
  return (
    <section class="jobs-panel">
      <div class="jobs-panel__head">
        <h3>Needs attention</h3>
        <p>
          {props.summary.total > 0
            ? `${props.summary.total} items need attention: ${props.summary.recovery} recoveries, ${props.summary.publish} publish drafts, ${props.summary.approval} approvals.`
            : "Everything is clear right now."}
        </p>
      </div>
      <div class="jobs-list">
        <Show
          when={props.items.length > 0}
          fallback={<div class="job-empty">Nothing is waiting in the inbox.</div>}
        >
          <For each={props.items.slice(0, 12)}>
            {(item) => (
              <button
                class="job-card job-card--button"
                data-selected={item.key === props.selectedKey ? "true" : undefined}
                onClick={() => {
                  props.onSelect(item.key);
                }}
                type="button"
              >
                <div class="job-card__head">
                  <div>
                    <div class="job-card__title">{item.title}</div>
                    <div class="job-card__meta">{item.subtitle}</div>
                  </div>
                  <div class="job-card__status" data-status={item.status}>
                    {item.status}
                  </div>
                </div>
                <Show when={item.meetingId}>
                  <div class="job-card__meta">{item.meetingId}</div>
                </Show>
                <div class="job-card__meta">{item.summary}</div>
                <div class="job-card__meta">{`Updated: ${item.timestamp.slice(0, 19)}`}</div>
              </button>
            )}
          </For>
        </Show>
      </div>
    </section>
  );
}

export function AutomationArtefactsPanel(props: AutomationArtefactsPanelProps): JSX.Element {
  return (
    <section class="jobs-panel">
      <div class="jobs-panel__head">
        <h3>Ready to publish</h3>
        <p>Generated meeting drafts waiting for review before they are written anywhere else.</p>
      </div>
      <div class="jobs-list">
        <Show
          when={props.artefacts.length > 0}
          fallback={<div class="job-empty">No publish-ready drafts yet.</div>}
        >
          <For each={props.artefacts.slice(0, 10)}>
            {(artefact) => (
              <button
                class="job-card job-card--button"
                data-selected={artefact.id === props.selectedArtefactId ? "true" : undefined}
                onClick={() => {
                  props.onSelect(artefact.id);
                }}
                type="button"
              >
                <div class="job-card__head">
                  <div>
                    <div class="job-card__title">{artefact.structured.title}</div>
                    <div class="job-card__meta">{`${artefact.kind} • ${artefact.ruleName}`}</div>
                  </div>
                  <div class="job-card__status" data-status={artefact.status}>
                    {artefact.status}
                  </div>
                </div>
                <div class="job-card__meta">{artefact.meetingId}</div>
                <Show when={artefact.structured.summary}>
                  <div class="job-card__meta">{artefact.structured.summary}</div>
                </Show>
                <div class="job-card__meta">{`Updated: ${artefact.updatedAt.slice(0, 19)}`}</div>
              </button>
            )}
          </For>
        </Show>
      </div>
    </section>
  );
}

export function IssueReviewPanel(props: {
  issue: GranolaProcessingIssue | null;
  onOpenMeeting: (meetingId: string) => void;
  onRecover: (id: string) => void;
}): JSX.Element {
  return (
    <section class="review-panel">
      <div class="jobs-panel__head">
        <h3>Needs recovery</h3>
        <p>Inspect the problem, jump to the meeting if needed, and retry from one place.</p>
      </div>
      <Show
        when={props.issue}
        fallback={<div class="job-empty">Select a recovery item to inspect it.</div>}
      >
        {(issue) => (
          <div class="review-body">
            <div class="detail-meta">
              <div class="detail-chip">{`Severity: ${issue().severity}`}</div>
              <div class="detail-chip">{`Kind: ${issue().kind}`}</div>
              <Show when={issue().meetingId}>
                <div class="detail-chip">{`Meeting: ${issue().meetingId}`}</div>
              </Show>
            </div>
            <section class="detail-section">
              <h2>{issue().title}</h2>
              <p>{issue().detail}</p>
              <div class="job-card__actions">
                <Show when={issue().meetingId}>
                  <button
                    class="button button--secondary"
                    onClick={() => {
                      props.onOpenMeeting(issue().meetingId!);
                    }}
                    type="button"
                  >
                    Open meeting
                  </button>
                </Show>
                <Show when={issue().recoverable}>
                  <button
                    class="button button--secondary"
                    onClick={() => {
                      props.onRecover(issue().id);
                    }}
                    type="button"
                  >
                    Recover
                  </button>
                </Show>
              </div>
            </section>
          </div>
        )}
      </Show>
    </section>
  );
}

export function RunReviewPanel(props: {
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onOpenMeeting: (meetingId: string) => void;
  run: GranolaAutomationActionRun | null;
}): JSX.Element {
  return (
    <section class="review-panel">
      <div class="jobs-panel__head">
        <h3>Needs approval</h3>
        <p>Approve or reject actions that explicitly asked for confirmation.</p>
      </div>
      <Show
        when={props.run}
        fallback={<div class="job-empty">Select an approval item to review it.</div>}
      >
        {(run) => (
          <div class="review-body">
            <div class="detail-meta">
              <div class="detail-chip">{`Status: ${run().status}`}</div>
              <div class="detail-chip">{`Action: ${run().actionName}`}</div>
              <div class="detail-chip">{`Rule: ${run().ruleName}`}</div>
              <div class="detail-chip">{`Meeting: ${run().meetingId}`}</div>
            </div>
            <section class="detail-section">
              <h2>{run().title}</h2>
              <p>{run().prompt || run().result || run().error || run().eventKind}</p>
              <div class="job-card__actions">
                <button
                  class="button button--secondary"
                  onClick={() => {
                    props.onOpenMeeting(run().meetingId);
                  }}
                  type="button"
                >
                  Open meeting
                </button>
                <Show when={run().status === "pending"}>
                  <>
                    <button
                      class="button button--secondary"
                      onClick={() => {
                        props.onApprove(run().id);
                      }}
                      type="button"
                    >
                      Approve
                    </button>
                    <button
                      class="button button--secondary"
                      onClick={() => {
                        props.onReject(run().id);
                      }}
                      type="button"
                    >
                      Reject
                    </button>
                  </>
                </Show>
              </div>
            </section>
          </div>
        )}
      </Show>
    </section>
  );
}

export function ArtefactReviewPanel(props: ArtefactReviewPanelProps): JSX.Element {
  return (
    <section class="review-panel">
      <div class="jobs-panel__head">
        <h3>Ready to publish</h3>
        <p>
          Review the draft, compare it with the current meeting note, then publish, reject, edit, or
          rerun.
        </p>
      </div>
      <Show
        when={props.artefact}
        fallback={
          <div class="job-empty">{props.error || "Select a publish-ready draft to review it."}</div>
        }
      >
        {(artefact) => (
          <div class="review-body">
            <div class="detail-meta">
              <div class="detail-chip">{`Status: ${artefact().status}`}</div>
              <div class="detail-chip">{`Kind: ${artefact().kind}`}</div>
              <div class="detail-chip">{`Meeting: ${artefact().meetingId}`}</div>
              <div class="detail-chip">{`Provider: ${artefact().provider}/${artefact().model}`}</div>
            </div>
            <Show when={!props.error} fallback={<div class="empty">{props.error}</div>}>
              <div class="review-grid">
                <section class="detail-section">
                  <h2>Current note</h2>
                  <Show
                    when={props.markdownViewerEnabled}
                    fallback={
                      <pre class="detail-pre">
                        {props.bundle?.meeting.noteMarkdown || "(No existing meeting notes)"}
                      </pre>
                    }
                  >
                    <MarkdownDocument
                      markdown={props.bundle?.meeting.noteMarkdown || "(No existing meeting notes)"}
                    />
                  </Show>
                </section>
                <section class="detail-section">
                  <h2>Draft to publish</h2>
                  <section class="detail-section detail-section--subsection">
                    <h3>Destination</h3>
                    <Show
                      when={props.publishPreview?.targets.length}
                      fallback={
                        <p class="section-note">
                          {props.publishPreviewError ||
                            props.publishPreview?.message ||
                            "No linked publish destination is configured for this draft yet."}
                        </p>
                      }
                    >
                      <div class="publish-target-panel">
                        <label class="field-row">
                          <span class="field-label">Target</span>
                          <select
                            class="field-input field-input--plain"
                            onInput={(event) => {
                              props.onSelectPublishTarget(event.currentTarget.value || null);
                            }}
                            value={
                              props.selectedPublishTargetId ||
                              props.publishPreview?.selectedTargetId ||
                              ""
                            }
                          >
                            <For each={props.publishPreview?.targets ?? []}>
                              {(target) => (
                                <option value={target.id}>{target.name ?? target.id}</option>
                              )}
                            </For>
                          </select>
                        </label>
                        <Show when={props.publishPreviewLoading}>
                          <p class="section-note">Loading publish preview…</p>
                        </Show>
                        <Show when={!props.publishPreviewLoading && props.publishPreview?.preview}>
                          <div class="publish-preview-list">
                            <For each={publishPreviewEntries(props.publishPreview)}>
                              {(item) => (
                                <div class="publish-preview-row">
                                  <div>
                                    <strong>{item.label}</strong>
                                    <div class="publish-preview-row__path">{item.path}</div>
                                  </div>
                                  <Show when={item.openUrl}>
                                    {(openUrl) => (
                                      <a
                                        class="mini-button"
                                        href={openUrl()}
                                        rel="noreferrer"
                                        target="_blank"
                                      >
                                        Open
                                      </a>
                                    )}
                                  </Show>
                                </div>
                              )}
                            </For>
                          </div>
                        </Show>
                      </div>
                    </Show>
                  </section>
                  <section class="detail-section detail-section--subsection">
                    <h3>How this draft was generated</h3>
                    <div class="detail-meta">
                      <div class="detail-chip">{`Rule: ${artefact().ruleName}`}</div>
                      <div class="detail-chip">{`Source action: ${artefact().actionName}`}</div>
                      <div class="detail-chip">{`Provider: ${artefact().provider}/${artefact().model}`}</div>
                    </div>
                    <p class="section-note">{artefactAttemptSummary(artefact())}</p>
                  </section>
                  <label class="field-row">
                    <span class="field-label">Title</span>
                    <input
                      class="field-input field-input--plain"
                      onInput={(event) => {
                        props.onDraftTitleChange(event.currentTarget.value);
                      }}
                      value={props.draftTitle}
                    />
                  </label>
                  <label class="field-row">
                    <span class="field-label">Summary</span>
                    <textarea
                      class="review-textarea review-textarea--summary"
                      onInput={(event) => {
                        props.onDraftSummaryChange(event.currentTarget.value);
                      }}
                    >
                      {props.draftSummary}
                    </textarea>
                  </label>
                  <label class="field-row">
                    <span class="field-label">Markdown</span>
                    <textarea
                      class="review-textarea"
                      onInput={(event) => {
                        props.onDraftMarkdownChange(event.currentTarget.value);
                      }}
                    >
                      {props.draftMarkdown}
                    </textarea>
                  </label>
                  <Show when={props.markdownViewerEnabled}>
                    <div class="detail-section detail-section--preview">
                      <h3>Rendered preview</h3>
                      <MarkdownDocument markdown={props.draftMarkdown} />
                    </div>
                  </Show>
                  <label class="field-row">
                    <span class="field-label">Reviewer note</span>
                    <textarea
                      class="review-textarea review-textarea--summary"
                      onInput={(event) => {
                        props.onReviewNoteChange(event.currentTarget.value);
                      }}
                    >
                      {props.reviewNote}
                    </textarea>
                  </label>
                  <div class="job-card__actions">
                    <button class="button button--secondary" onClick={props.onSave} type="button">
                      Save edits
                    </button>
                    <button
                      class="button button--secondary"
                      disabled={artefact().status === "superseded"}
                      onClick={props.onApprove}
                      type="button"
                    >
                      Approve
                    </button>
                    <button
                      class="button button--secondary"
                      disabled={artefact().status === "superseded"}
                      onClick={props.onReject}
                      type="button"
                    >
                      Reject
                    </button>
                    <button class="button button--secondary" onClick={props.onRerun} type="button">
                      Rerun
                    </button>
                  </div>
                  <Show when={artefact().structured.actionItems.length > 0}>
                    <div class="detail-section">
                      <h3>Action Items</h3>
                      <ul class="detail-list">
                        <For each={artefact().structured.actionItems}>
                          {(item) => (
                            <li>
                              <strong>{item.title}</strong>
                              <Show when={item.owner}>
                                <span>{` • ${item.owner}`}</span>
                              </Show>
                              <Show when={item.dueDate}>
                                <span>{` • due ${item.dueDate}`}</span>
                              </Show>
                            </li>
                          )}
                        </For>
                      </ul>
                    </div>
                  </Show>
                  <Show when={(artefact().structured.participantSummaries?.length ?? 0) > 0}>
                    <div class="detail-section">
                      <h3>Participant Summaries</h3>
                      <ul class="detail-list">
                        <For each={artefact().structured.participantSummaries}>
                          {(summary) => (
                            <li>
                              <strong>{summary.speaker}</strong>
                              <Show when={summary.role}>
                                <span>{` • ${summary.role}`}</span>
                              </Show>
                              <div>{summary.summary}</div>
                            </li>
                          )}
                        </For>
                      </ul>
                    </div>
                  </Show>
                </section>
              </div>
            </Show>
            <section class="detail-section review-history">
              <h2>History</h2>
              <div class="jobs-list">
                <For each={artefact().history.slice().reverse()}>
                  {(entry) => (
                    <div class="job-card">
                      <div class="job-card__head">
                        <div class="job-card__title">{entry.action}</div>
                        <div class="job-card__meta">{entry.at.slice(0, 19)}</div>
                      </div>
                      <Show when={entry.note}>
                        <div class="job-card__meta">{entry.note}</div>
                      </Show>
                    </div>
                  )}
                </For>
              </div>
            </section>
          </div>
        )}
      </Show>
    </section>
  );
}
