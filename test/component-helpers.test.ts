import { describe, expect, test } from "vite-plus/test";

import type { GranolaMeetingBundle, MeetingRecord } from "../src/app/index.ts";
import {
  compactPathLabel,
  formatDateTimeLabel,
  meetingContextSummary,
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
    ).toBe("Background sync every 15 min");
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
});
