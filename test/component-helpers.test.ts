import { describe, expect, test } from "vite-plus/test";

import type { GranolaAppState, GranolaMeetingBundle, MeetingRecord } from "../src/app/index.ts";
import {
  compactPathLabel,
  formatBytesLabel,
  folderFreshnessNote,
  formatDateTimeLabel,
  meetingContextSummary,
  meetingFreshnessNote,
  meetingListFreshnessNote,
  pathLeafLabel,
  relativeTimeLabel,
  metadataLines,
  resolveAsyncViewState,
  resolveMeetingWorkspaceState,
  syncCadenceLabel,
  workspaceBody,
} from "../src/web-app/component-helpers.ts";

function buildMeetingRecord(): MeetingRecord {
  return {
    meeting: {
      createdAt: "2026-04-02T09:00:27.200Z",
      folders: [],
      id: "not_rb5lnOO7NrzV95",
      noteContentSource: "content",
      tags: [],
      title: "Payment Ops",
      transcriptLoaded: true,
      transcriptSegmentCount: 413,
      updatedAt: "2026-04-02T09:31:15.077Z",
    },
    note: {
      content: "Adyen Go-Live Status\n\n- Road to production delayed",
      contentSource: "content",
      createdAt: "2026-04-02T09:00:27.200Z",
      id: "not_rb5lnOO7NrzV95",
      tags: [],
      title: "Payment Ops",
      updatedAt: "2026-04-02T09:31:15.077Z",
    },
    noteMarkdown:
      "---\nid: not_rb5lnOO7NrzV95\ncreated: 2026-04-02T09:00:27.200Z\nupdated: 2026-04-02T09:31:15.077Z\n---\n\n# Payment Ops\n\nAdyen Go-Live Status\n\n- Road to production delayed\n",
    roleHelpers: {
      ownerCandidates: [],
      participants: [],
      speakers: [],
    },
    transcript: null,
    transcriptText: null,
  };
}

function buildMeetingBundle(record: MeetingRecord): GranolaMeetingBundle {
  return {
    meeting: record,
    source: {
      document: {
        content: "",
        createdAt: "2026-04-02T09:00:27.200Z",
        folderMemberships: [
          {
            id: "folder-super",
            name: "Super",
          },
        ],
        id: "not_rb5lnOO7NrzV95",
        notesPlain: "",
        tags: [],
        title: "Payment Ops",
        updatedAt: "2026-04-02T09:31:15.077Z",
      },
    },
  } as unknown as GranolaMeetingBundle;
}

describe("web meeting helpers", () => {
  test("uses bundle folder memberships when projected folders are missing", () => {
    const record = buildMeetingRecord();
    const bundle = buildMeetingBundle(record);

    expect(meetingContextSummary(record, bundle)).toBe(
      "2026-04-02 • Super • 413 transcript segments",
    );
    expect(metadataLines(record, bundle)).toContain("Folders: Super");
  });

  test("uses note content for the reader view instead of export markdown", () => {
    const record = buildMeetingRecord();
    const bundle = buildMeetingBundle(record);
    const notesView = workspaceBody(bundle, record, "notes");

    expect(notesView.body).toBe("Adyen Go-Live Status\n\n- Road to production delayed");
    expect(notesView.body).not.toContain("id:");
    expect(notesView.body).not.toContain("# Payment Ops");
  });

  test("prefers loading states over empty copy for async browser panels", () => {
    expect(resolveAsyncViewState({ count: 0, loading: true })).toBe("loading");
    expect(resolveAsyncViewState({ count: 0, error: "boom" })).toBe("error");
    expect(resolveAsyncViewState({ count: 2, loading: true })).toBe("content");
    expect(resolveAsyncViewState({ count: 0 })).toBe("empty");
  });

  test("keeps the meeting workspace in loading state until the first detail fetch settles", () => {
    expect(resolveMeetingWorkspaceState({ hasMeeting: false, loading: true })).toBe("loading");
    expect(resolveMeetingWorkspaceState({ detailError: "missing", hasMeeting: false })).toBe(
      "error",
    );
    expect(resolveMeetingWorkspaceState({ hasMeeting: true })).toBe("content");
    expect(resolveMeetingWorkspaceState({ hasMeeting: false })).toBe("empty");
  });

  test("formats sync timestamps and path labels for diagnostics surfaces", () => {
    expect(formatDateTimeLabel("2026-04-07T12:34:56.000Z")).toBe("2026-04-07 12:34:56");
    expect(formatDateTimeLabel()).toBe("Not recorded");
    expect(
      compactPathLabel(
        "/Users/nima/Library/Application Support/granola-toolkit/meeting-index.json",
      ),
    ).toBe(".../Application Support/granola-toolkit/meeting-index.json");
    expect(compactPathLabel()).toBe("Not configured");
    expect(
      pathLeafLabel("/Users/nima/Library/Application Support/granola-toolkit/meeting-index.json"),
    ).toBe("meeting-index.json");
    expect(formatBytesLabel(4_096)).toBe("4.0 KB");
    expect(formatBytesLabel(128)).toBe("128 B");
  });

  test("describes sync cadence in user language", () => {
    expect(
      syncCadenceLabel({
        build: {
          packageName: "granola-toolkit",
          version: "0.66.0",
        },
        config: {},
        capabilities: {
          attach: true,
          auth: true,
          automation: true,
          events: true,
          exports: true,
          folders: true,
          meetingOpen: true,
          plugins: true,
          processing: true,
          sync: true,
          webClient: true,
        },
        persistence: {
          exportJobs: true,
          meetingIndex: true,
          sessionStore: "file",
          syncEvents: true,
          syncState: true,
        },
        product: "granola-toolkit",
        protocolVersion: 3,
        runtime: {
          mode: "background-service",
          startedAt: "2026-04-07T12:34:56.000Z",
          syncEnabled: true,
          syncIntervalMs: 900_000,
        },
        transport: "local-http",
      }),
    ).toBe("Checks Granola for changes every 15 min");
    expect(
      syncCadenceLabel({
        build: {
          packageName: "granola-toolkit",
          version: "0.66.0",
        },
        config: {},
        capabilities: {
          attach: true,
          auth: true,
          automation: true,
          events: true,
          exports: true,
          folders: true,
          meetingOpen: true,
          plugins: true,
          processing: true,
          sync: true,
          webClient: true,
        },
        persistence: {
          exportJobs: true,
          meetingIndex: true,
          sessionStore: "file",
          syncEvents: true,
          syncState: true,
        },
        product: "granola-toolkit",
        protocolVersion: 3,
        runtime: {
          mode: "background-service",
          startedAt: "2026-04-07T12:34:56.000Z",
          syncEnabled: false,
        },
        transport: "local-http",
      }),
    ).toBe("Manual sync only");
  });

  test("describes when folders and meetings are coming from local fallback state", () => {
    const record = buildMeetingRecord();
    const bundle = buildMeetingBundle(record);
    const appState = {
      documents: {
        count: 331,
        loaded: true,
        loadedAt: "2026-04-07T12:40:00.000Z",
        source: "snapshot",
      },
      folders: {
        count: 4,
        loaded: true,
        loadedAt: "2026-04-07T12:41:00.000Z",
        source: "documents",
      },
      sync: {
        eventCount: 3,
        lastChanges: [],
        lastCompletedAt: "2026-04-07T12:42:00.000Z",
        running: false,
      },
    } as unknown as GranolaAppState;

    expect(folderFreshnessNote(appState)).toBe(
      "Folder membership comes from locally synced meeting metadata.",
    );
    expect(
      meetingListFreshnessNote({
        appState,
        meetingSource: "snapshot",
        selectedFolderLabel: "Super",
      }),
    ).toBe(
      "Showing meetings from the last locally synced snapshot from 2026-04-07 12:42:00. Folder membership comes from locally synced meeting metadata.",
    );
    expect(
      meetingFreshnessNote({
        appState,
        bundle,
        meeting: {
          ...record,
          meeting: {
            ...record.meeting,
            transcriptLoaded: false,
          },
        },
        meetingSource: "index",
        selectedFolderLabel: "Super",
      }),
    ).toBe(
      "Showing the last locally synced meeting snapshot from 2026-04-07 12:42:00. Folder labels come from locally synced metadata. Transcript will load from Granola when you open it.",
    );
  });

  test("formats relative times in user language", () => {
    const now = Date.now;
    Date.now = () => Date.parse("2026-04-07T13:00:00.000Z");
    try {
      expect(relativeTimeLabel("2026-04-07T12:57:00.000Z")).toBe("3 min ago");
      expect(relativeTimeLabel("2026-04-07T11:00:00.000Z")).toBe("2 hrs ago");
      expect(relativeTimeLabel("2026-04-05T13:00:00.000Z")).toBe("2 days ago");
    } finally {
      Date.now = now;
    }
  });
});
