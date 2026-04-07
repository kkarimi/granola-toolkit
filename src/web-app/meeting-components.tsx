/** @jsxImportSource solid-js */

import { For, Show, type JSX } from "solid-js";

import type { GranolaMeetingBundle, MeetingRecord } from "../app/index.ts";
import { parseWorkspaceTab, type WorkspaceTab } from "../web/client-state.ts";

import {
  formatDateLabel,
  meetingFolderSummary,
  tagSummary,
  workspaceBody,
} from "./component-helpers.ts";
import { MarkdownDocument } from "./markdown-viewer.tsx";

interface WorkspaceProps {
  bundle: GranolaMeetingBundle | null;
  detailError?: string;
  fallbackFolderLabel?: string | null;
  markdownViewerEnabled: boolean;
  onSelectTab: (tab: WorkspaceTab) => void;
  selectedMeeting: MeetingRecord | null;
  tab: WorkspaceTab;
}

export function Workspace(props: WorkspaceProps): JSX.Element {
  const parsedTab = () => parseWorkspaceTab(props.tab);
  const details = () => {
    if (!props.selectedMeeting) {
      return null;
    }

    return workspaceBody(props.bundle, props.selectedMeeting, parsedTab());
  };

  return (
    <Show
      when={props.selectedMeeting}
      fallback={
        <div class="empty">
          {props.detailError ||
            "Choose a folder, recent meeting, or search result to open it here."}
        </div>
      }
    >
      {(meeting) => (
        <>
          <section class="meeting-context">
            <div class="detail-meta">
              <div class="detail-chip">{formatDateLabel(meeting().meeting.createdAt)}</div>
              <div class="detail-chip">
                {`Folders: ${meetingFolderSummary(meeting(), props.bundle, props.fallbackFolderLabel)}`}
              </div>
              <Show when={meeting().meeting.tags.length > 0}>
                <div class="detail-chip">{`Tags: ${tagSummary(meeting().meeting.tags)}`}</div>
              </Show>
              <div class="detail-chip">
                {meeting().meeting.transcriptLoaded
                  ? `${meeting().meeting.transcriptSegmentCount} transcript segments`
                  : "Transcript on demand"}
              </div>
            </div>
          </section>
          <nav class="workspace-tabs">
            <For each={["notes", "transcript", "metadata", "raw"] as const}>
              {(tab) => (
                <button
                  class="workspace-tab"
                  data-selected={parsedTab() === tab ? "true" : undefined}
                  onClick={() => {
                    props.onSelectTab(tab);
                  }}
                  type="button"
                >
                  {tab === "notes"
                    ? "Notes"
                    : tab === "transcript"
                      ? "Transcript"
                      : tab === "metadata"
                        ? "Metadata"
                        : "Raw"}
                </button>
              )}
            </For>
          </nav>
          <Show when={!props.detailError} fallback={<div class="empty">{props.detailError}</div>}>
            <section class="workspace-frame">
              <Show when={parsedTab() === "metadata" || parsedTab() === "raw"}>
                <div class="workspace-frame__head">
                  <h2>{details()?.title}</h2>
                  <p>{details()?.description}</p>
                </div>
              </Show>
              <div class="detail-body workspace-frame__body">
                <Show
                  when={
                    parsedTab() === "notes" &&
                    props.markdownViewerEnabled &&
                    Boolean(meeting().note.content.trim())
                  }
                  fallback={<pre class="detail-pre">{details()?.body}</pre>}
                >
                  <MarkdownDocument markdown={meeting().note.content} />
                </Show>
              </div>
            </section>
          </Show>
        </>
      )}
    </Show>
  );
}
