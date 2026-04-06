import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@mariozechner/pi-tui";

import type {
  FolderSummaryRecord,
  GranolaAppState,
  GranolaMeetingBundle,
  MeetingSummaryRecord,
  MeetingSummarySource,
} from "../app/index.ts";

import { buildGranolaTuiSummary, renderGranolaTuiMeetingTab } from "./helpers.ts";
import { granolaTuiTheme } from "./theme.ts";
import type { GranolaTuiFocusPane, GranolaTuiStatusTone, GranolaTuiWorkspaceTab } from "./types.ts";

export interface GranolaTuiWorkspaceViewModel {
  activePane: GranolaTuiFocusPane;
  appState: GranolaAppState;
  detailError: string;
  detailScroll: number;
  folderError: string;
  folders: FolderSummaryRecord[];
  listError: string;
  loadingDetail: boolean;
  loadingMeetings: boolean;
  meetingSource: MeetingSummarySource;
  meetings: MeetingSummaryRecord[];
  recentMeetingIds: string[];
  selectedFolderId?: string;
  selectedMeeting?: GranolaMeetingBundle;
  selectedMeetingId?: string;
  statusMessage: string;
  statusTone: GranolaTuiStatusTone;
  tab: GranolaTuiWorkspaceTab;
}

export function padLine(text: string, width: number): string {
  const clipped = truncateToWidth(text, width, "");
  return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

export function wrapBlock(text: string, width: number): string[] {
  const lines: string[] = [];
  for (const line of text.split("\n")) {
    const wrapped = wrapTextWithAnsi(line, Math.max(1, width));
    if (wrapped.length === 0) {
      lines.push("");
      continue;
    }
    lines.push(...wrapped);
  }
  return lines;
}

function toneText(tone: GranolaTuiStatusTone, text: string): string {
  switch (tone) {
    case "error":
      return granolaTuiTheme.error(text);
    case "warning":
      return granolaTuiTheme.warning(text);
    case "info":
    default:
      return granolaTuiTheme.info(text);
  }
}

function normaliseSelectedIndex(
  meetings: MeetingSummaryRecord[],
  selectedMeetingId?: string,
): number {
  if (meetings.length === 0) {
    return -1;
  }

  const selectedIndex = selectedMeetingId
    ? meetings.findIndex((meeting) => meeting.id === selectedMeetingId)
    : -1;

  return selectedIndex >= 0 ? selectedIndex : 0;
}

function normaliseSelectedFolderIndex(
  folders: FolderSummaryRecord[],
  selectedFolderId?: string,
): number {
  if (!selectedFolderId) {
    return 0;
  }

  const selectedIndex = folders.findIndex((folder) => folder.id === selectedFolderId);
  return selectedIndex >= 0 ? selectedIndex + 1 : 0;
}

export function resolveWorkspaceLayout(width: number): {
  detailWidth: number;
  listWidth: number;
} {
  const minimumDetailWidth = 24;
  const minimumListWidth = 24;
  const available = Math.max(1, width - 3);
  let listWidth = Math.max(minimumListWidth, Math.min(42, Math.floor(available * 0.34)));
  let detailWidth = available - listWidth;

  if (detailWidth < minimumDetailWidth) {
    detailWidth = minimumDetailWidth;
    listWidth = Math.max(minimumListWidth, available - detailWidth);
  }

  if (listWidth + detailWidth > available) {
    detailWidth = Math.max(minimumDetailWidth, available - listWidth);
  }

  return {
    detailWidth,
    listWidth,
  };
}

export function currentDetailBody(view: GranolaTuiWorkspaceViewModel, width: number): string[] {
  if (view.detailError) {
    return wrapBlock(view.detailError, width);
  }

  if (view.loadingDetail && !view.selectedMeeting) {
    return wrapBlock("Loading meeting details…", width);
  }

  if (!view.selectedMeeting) {
    return wrapBlock("Select a meeting to inspect its notes, transcript, and metadata.", width);
  }

  return wrapBlock(renderGranolaTuiMeetingTab(view.selectedMeeting, view.tab), width);
}

export function detailScrollStep(
  view: GranolaTuiWorkspaceViewModel,
  width: number,
  height: number,
): number {
  const bodyHeight = Math.max(1, height - 2);
  const totalLines = currentDetailBody(view, width).length;
  if (totalLines <= bodyHeight) {
    return 0;
  }

  return Math.max(1, Math.min(bodyHeight - 1, totalLines - bodyHeight));
}

function renderListPane(
  view: GranolaTuiWorkspaceViewModel,
  width: number,
  height: number,
): string[] {
  const lines: string[] = [];
  const innerWidth = Math.max(1, width - 2);
  const recentMeetings = view.recentMeetingIds
    .map((meetingId) => view.meetings.find((meeting) => meeting.id === meetingId))
    .filter((meeting): meeting is MeetingSummaryRecord => meeting !== undefined);
  const folderEntries = [
    {
      id: undefined,
      label: "All meetings",
      meta: view.folders.length > 0 ? `${view.folders.length} folders` : "global scope",
    },
    ...view.folders.map((folder) => ({
      id: folder.id,
      label: `${folder.isFavourite ? "★ " : ""}${folder.name || folder.id}`,
      meta: `${folder.documentCount} meetings`,
    })),
  ];
  const availableRows = Math.max(2, height - 3);
  const folderWindowSize = Math.min(
    Math.max(3, Math.min(8, Math.floor(availableRows * 0.35))),
    Math.max(1, availableRows - 1),
  );
  const recentWindowSize =
    recentMeetings.length > 0 ? Math.min(Math.max(2, recentMeetings.length), 3) : 0;
  const meetingWindowSize = Math.max(1, availableRows - folderWindowSize - recentWindowSize);

  const folderHeader = `${
    view.activePane === "folders"
      ? granolaTuiTheme.accent("Folders")
      : granolaTuiTheme.strong("Folders")
  } ${granolaTuiTheme.dim(`(${view.folders.length})`)}`;
  lines.push(padLine(folderHeader, innerWidth));

  if (view.folderError) {
    lines.push(
      ...wrapBlock(granolaTuiTheme.error(view.folderError), innerWidth).slice(0, folderWindowSize),
    );
    while (lines.length < 1 + folderWindowSize) {
      lines.push(" ".repeat(innerWidth));
    }
  } else {
    const selectedFolderIndex = normaliseSelectedFolderIndex(view.folders, view.selectedFolderId);
    const folderStartIndex = Math.max(
      0,
      Math.min(
        selectedFolderIndex - Math.floor(folderWindowSize / 2),
        folderEntries.length - folderWindowSize,
      ),
    );
    const visibleFolders = folderEntries.slice(
      folderStartIndex,
      folderStartIndex + folderWindowSize,
    );

    for (const [offset, folder] of visibleFolders.entries()) {
      const actualIndex = folderStartIndex + offset;
      const selected = actualIndex === selectedFolderIndex;
      const prefix = selected ? "> " : "  ";
      const maxLabelWidth = Math.max(
        6,
        innerWidth - visibleWidth(prefix) - visibleWidth(folder.meta) - 1,
      );
      const label = truncateToWidth(folder.label, maxLabelWidth, "");
      const labelBlock = `${prefix}${label}`;
      const gap = " ".repeat(
        Math.max(1, innerWidth - visibleWidth(labelBlock) - visibleWidth(folder.meta)),
      );
      const line = `${labelBlock}${gap}${granolaTuiTheme.dim(folder.meta)}`;
      lines.push(
        selected ? padLine(granolaTuiTheme.selected(line), innerWidth) : padLine(line, innerWidth),
      );
    }

    while (lines.length < 1 + folderWindowSize) {
      lines.push(" ".repeat(innerWidth));
    }
  }

  lines.push(padLine(granolaTuiTheme.dim(""), innerWidth));

  if (recentWindowSize > 0) {
    lines.push(padLine(granolaTuiTheme.strong("Recent"), innerWidth));
    for (const meeting of recentMeetings.slice(0, recentWindowSize)) {
      const prefix = meeting.id === view.selectedMeetingId ? "> " : "  ";
      const dateLabel = meeting.updatedAt.slice(0, 10);
      const maxTitleWidth = Math.max(6, innerWidth - visibleWidth(prefix) - dateLabel.length - 1);
      const title = truncateToWidth(meeting.title || meeting.id, maxTitleWidth, "");
      const titleBlock = `${prefix}${title}`;
      const gap = " ".repeat(
        Math.max(1, innerWidth - visibleWidth(titleBlock) - visibleWidth(dateLabel)),
      );
      lines.push(padLine(`${titleBlock}${gap}${granolaTuiTheme.dim(dateLabel)}`, innerWidth));
    }
    lines.push(padLine(granolaTuiTheme.dim(""), innerWidth));
  }

  const meetingsHeader = `${
    view.activePane === "meetings"
      ? granolaTuiTheme.accent("Meetings")
      : granolaTuiTheme.strong("Meetings")
  } ${granolaTuiTheme.dim(`(${view.meetings.length})`)}`;
  lines.push(padLine(meetingsHeader, innerWidth));

  if (view.listError) {
    lines.push(
      ...wrapBlock(granolaTuiTheme.error(view.listError), innerWidth).slice(0, meetingWindowSize),
    );
    while (lines.length < height) {
      lines.push(" ".repeat(innerWidth));
    }
    return lines;
  }

  if (view.meetings.length === 0) {
    const emptyMessage = view.appState.auth.lastError
      ? "Auth needs attention. Press a to fix credentials."
      : view.appState.sync.lastCompletedAt
        ? "No meetings in this scope. Press / to quick open or Tab to change panes."
        : "No meetings yet. Press r to sync, or a to configure auth.";
    lines.push(...wrapBlock(emptyMessage, innerWidth).slice(0, meetingWindowSize));
    while (lines.length < height) {
      lines.push(" ".repeat(innerWidth));
    }
    return lines;
  }

  const selectedIndex = normaliseSelectedIndex(view.meetings, view.selectedMeetingId);
  const startIndex = Math.max(
    0,
    Math.min(
      selectedIndex - Math.floor(meetingWindowSize / 2),
      view.meetings.length - meetingWindowSize,
    ),
  );
  const visibleMeetings = view.meetings.slice(startIndex, startIndex + meetingWindowSize);

  for (const [offset, meeting] of visibleMeetings.entries()) {
    const actualIndex = startIndex + offset;
    const selected = actualIndex === selectedIndex;
    const dateLabel = meeting.updatedAt.slice(0, 10);
    const prefix = selected ? "> " : "  ";
    const maxTitleWidth = Math.max(6, innerWidth - visibleWidth(prefix) - dateLabel.length - 1);
    const title = truncateToWidth(meeting.title || meeting.id, maxTitleWidth, "");
    const titleBlock = `${prefix}${title}`;
    const gap = " ".repeat(
      Math.max(1, innerWidth - visibleWidth(titleBlock) - visibleWidth(dateLabel)),
    );
    const line = `${titleBlock}${gap}${granolaTuiTheme.dim(dateLabel)}`;
    lines.push(
      selected ? padLine(granolaTuiTheme.selected(line), innerWidth) : padLine(line, innerWidth),
    );
  }

  while (lines.length < height) {
    lines.push(" ".repeat(innerWidth));
  }

  return lines;
}

function renderDetailPane(
  view: GranolaTuiWorkspaceViewModel,
  width: number,
  height: number,
): string[] {
  const lines: string[] = [];
  const innerWidth = Math.max(1, width - 2);
  const tabs: Array<{ id: GranolaTuiWorkspaceTab; label: string }> = [
    { id: "notes", label: "1 Notes" },
    { id: "transcript", label: "2 Transcript" },
    { id: "metadata", label: "3 Metadata" },
    { id: "raw", label: "4 Raw" },
  ];

  const title = view.selectedMeeting?.meeting.meeting.title || view.selectedMeetingId || "Meeting";
  const titleLine = `${granolaTuiTheme.strong(title)} ${granolaTuiTheme.dim(
    view.selectedMeeting ? view.selectedMeeting.meeting.meeting.id : "",
  )}`.trim();
  lines.push(padLine(titleLine, innerWidth));

  const tabLine = tabs
    .map((tab) =>
      tab.id === view.tab ? granolaTuiTheme.selected(` ${tab.label} `) : ` ${tab.label} `,
    )
    .join(" ");
  lines.push(padLine(tabLine, innerWidth));

  const bodyLines = currentDetailBody(view, innerWidth);
  const bodyHeight = Math.max(1, height - 2);
  const visibleBody = bodyLines.slice(view.detailScroll, view.detailScroll + bodyHeight);

  lines.push(...visibleBody.map((line) => padLine(line, innerWidth)));
  while (lines.length < height) {
    lines.push(" ".repeat(innerWidth));
  }

  return lines;
}

export function renderWorkspace(
  view: GranolaTuiWorkspaceViewModel,
  width: number,
  totalHeight: number,
): string[] {
  const { detailWidth, listWidth } = resolveWorkspaceLayout(width);
  const headerHeight = 2;
  const footerHeight = 2;
  const bodyHeight = Math.max(6, totalHeight - headerHeight - footerHeight);
  const selectedLabel =
    view.selectedMeeting?.meeting.meeting.title || view.selectedMeetingId || "none";

  const headerTitle = padLine(
    `${granolaTuiTheme.accent("Granola Toolkit TUI")} ${granolaTuiTheme.dim(
      view.loadingMeetings ? "loading…" : selectedLabel,
    )}`,
    width,
  );
  const headerSummary = padLine(
    granolaTuiTheme.dim(buildGranolaTuiSummary(view.appState, view.meetingSource)),
    width,
  );

  const listLines = renderListPane(view, listWidth, bodyHeight);
  const detailLines = renderDetailPane(view, detailWidth, bodyHeight);
  const bodyLines: string[] = [];

  for (let index = 0; index < bodyHeight; index += 1) {
    bodyLines.push(
      `${padLine(listLines[index] ?? "", listWidth)} | ${padLine(detailLines[index] ?? "", detailWidth)}`,
    );
  }

  const footerStatus = padLine(toneText(view.statusTone, view.statusMessage), width);
  const footerHints = padLine(
    granolaTuiTheme.dim(
      "h/l or Tab pane  j/k move  / palette  a auth  u automation  r sync  1-4 tabs  PgUp/PgDn scroll  q quit",
    ),
    width,
  );

  return [headerTitle, headerSummary, ...bodyLines, footerStatus, footerHints];
}
