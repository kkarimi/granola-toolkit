import { describe, expect, test } from "vite-plus/test";

import {
  buildMeetingRoleHelpers,
  buildTranscriptSpeakers,
  resolveMeetingOwnerCandidate,
} from "../src/meeting-roles.ts";

describe("meeting role helpers", () => {
  test("matches transcript speakers to calendar people and derives owner candidates", () => {
    const speakers = buildTranscriptSpeakers(
      [
        {
          endTimestamp: "2024-01-01T09:00:03Z",
          source: "microphone",
          startTimestamp: "2024-01-01T09:00:01Z",
          text: "I will send the recap.",
        },
        {
          endTimestamp: "2024-01-01T09:01:03Z",
          source: "Alice Chen",
          startTimestamp: "2024-01-01T09:01:01Z",
          text: "I will review the onboarding deck.",
        },
      ],
      {
        attendees: [{ email: "alice@example.com", name: "Alice Chen" }],
        creator: { email: "nima@example.com", name: "Nima Karimi" },
      },
    );
    const helpers = buildMeetingRoleHelpers(
      {
        attendees: [{ email: "alice@example.com", name: "Alice Chen" }],
        creator: { email: "nima@example.com", name: "Nima Karimi" },
      },
      speakers,
    );

    expect(speakers).toEqual([
      expect.objectContaining({
        label: "You",
        matchedParticipantLabel: "Nima Karimi",
        role: "self",
      }),
      expect.objectContaining({
        label: "Alice Chen",
        matchedParticipantEmail: "alice@example.com",
        role: "attendee",
      }),
    ]);
    expect(helpers.ownerCandidates).toEqual([
      expect.objectContaining({
        email: "alice@example.com",
        label: "Alice Chen",
        role: "attendee",
      }),
      expect.objectContaining({
        email: "nima@example.com",
        label: "Nima Karimi",
        role: "self",
      }),
    ]);
  });

  test("resolves self references and partial names to canonical owners", () => {
    const helpers = buildMeetingRoleHelpers(
      {
        attendees: [{ email: "alice@example.com", name: "Alice Chen" }],
        creator: { email: "nima@example.com", name: "Nima Karimi" },
      },
      buildTranscriptSpeakers(
        [
          {
            endTimestamp: "2024-01-01T09:00:03Z",
            source: "microphone",
            startTimestamp: "2024-01-01T09:00:01Z",
            text: "I will send the recap.",
          },
          {
            endTimestamp: "2024-01-01T09:01:03Z",
            source: "Alice",
            startTimestamp: "2024-01-01T09:01:01Z",
            text: "I will review the deck.",
          },
        ],
        {
          attendees: [{ email: "alice@example.com", name: "Alice Chen" }],
          creator: { email: "nima@example.com", name: "Nima Karimi" },
        },
      ),
    );

    expect(resolveMeetingOwnerCandidate("you", helpers)).toEqual({
      owner: "Nima Karimi",
      ownerEmail: "nima@example.com",
      ownerOriginal: "you",
      ownerRole: "self",
    });
    expect(resolveMeetingOwnerCandidate("Alice", helpers)).toEqual({
      owner: "Alice Chen",
      ownerEmail: "alice@example.com",
      ownerOriginal: "Alice",
      ownerRole: "attendee",
    });
  });
});
