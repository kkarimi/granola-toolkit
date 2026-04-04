import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";

import type { MeetingSummaryRecord } from "./app/models.ts";
import { parseJsonString } from "./utils.ts";

const MEETING_INDEX_VERSION = 1;

interface MeetingIndexFile {
  meetings: MeetingSummaryRecord[];
  updatedAt: string;
  version: number;
}

export interface MeetingIndexStore {
  readIndex(): Promise<MeetingSummaryRecord[]>;
  writeIndex(meetings: MeetingSummaryRecord[]): Promise<void>;
}

export class MemoryMeetingIndexStore implements MeetingIndexStore {
  #meetings: MeetingSummaryRecord[] = [];

  async readIndex(): Promise<MeetingSummaryRecord[]> {
    return this.#meetings.map((meeting) => ({ ...meeting, tags: [...meeting.tags] }));
  }

  async writeIndex(meetings: MeetingSummaryRecord[]): Promise<void> {
    this.#meetings = meetings.map((meeting) => ({ ...meeting, tags: [...meeting.tags] }));
  }
}

export class FileMeetingIndexStore implements MeetingIndexStore {
  constructor(private readonly filePath: string = defaultMeetingIndexFilePath()) {}

  async readIndex(): Promise<MeetingSummaryRecord[]> {
    try {
      const contents = await readFile(this.filePath, "utf8");
      const parsed = parseJsonString<MeetingIndexFile>(contents);
      if (!parsed || parsed.version !== MEETING_INDEX_VERSION || !Array.isArray(parsed.meetings)) {
        return [];
      }

      return parsed.meetings.map((meeting) => ({
        ...meeting,
        tags: [...meeting.tags],
      }));
    } catch {
      return [];
    }
  }

  async writeIndex(meetings: MeetingSummaryRecord[]): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const payload: MeetingIndexFile = {
      meetings: meetings.map((meeting) => ({ ...meeting, tags: [...meeting.tags] })),
      updatedAt: new Date().toISOString(),
      version: MEETING_INDEX_VERSION,
    };
    await writeFile(this.filePath, `${JSON.stringify(payload, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
  }
}

export function defaultMeetingIndexFilePath(): string {
  const home = homedir();
  return platform() === "darwin"
    ? join(home, "Library", "Application Support", "granola-toolkit", "meeting-index.json")
    : join(home, ".config", "granola-toolkit", "meeting-index.json");
}

export function createDefaultMeetingIndexStore(): MeetingIndexStore {
  return new FileMeetingIndexStore();
}
