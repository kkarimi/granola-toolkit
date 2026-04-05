import type {
  MeetingOwnerCandidateRecord,
  MeetingParticipantRecord,
  MeetingRoleHelpersRecord,
  MeetingSpeakerRecord,
} from "./app/models.ts";
import type { GranolaMeetingPeople, GranolaMeetingPerson, TranscriptSegment } from "./types.ts";
import { compareStrings, sanitiseFilename, transcriptSpeakerLabel } from "./utils.ts";

function normaliseKey(value: string | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function collapseSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function personLabel(person: GranolaMeetingPerson): string {
  return collapseSpaces(person.name || person.email || "Unknown participant");
}

function personId(role: MeetingParticipantRecord["role"], person: GranolaMeetingPerson): string {
  const stable = person.email?.trim() || person.name?.trim() || `unknown-${role}`;
  return `${role}:${sanitiseFilename(stable.toLowerCase(), role)}`;
}

function personToParticipant(
  role: MeetingParticipantRecord["role"],
  person: GranolaMeetingPerson,
): MeetingParticipantRecord {
  return {
    companyName: person.companyName?.trim() || undefined,
    email: person.email?.trim() || undefined,
    id: personId(role, person),
    label: personLabel(person),
    role,
    title: person.title?.trim() || undefined,
  };
}

function uniqueParticipants(people?: GranolaMeetingPeople): MeetingParticipantRecord[] {
  const participants: MeetingParticipantRecord[] = [];
  const seen = new Set<string>();

  const add = (role: MeetingParticipantRecord["role"], person?: GranolaMeetingPerson): void => {
    if (!person) {
      return;
    }

    const participant = personToParticipant(role, person);
    const key = participant.email?.toLowerCase() || normaliseKey(participant.label);
    if (!key || seen.has(key)) {
      return;
    }

    seen.add(key);
    participants.push(participant);
  };

  add("creator", people?.creator);
  for (const attendee of people?.attendees ?? []) {
    add("attendee", attendee);
  }

  return participants.sort((left, right) => compareStrings(left.label, right.label));
}

function participantMatchKeys(participant: MeetingParticipantRecord): Set<string> {
  const values = new Set<string>();
  const label = normaliseKey(participant.label);
  if (label) {
    values.add(label);

    const parts = label.split(" ").filter(Boolean);
    if (parts[0]) {
      values.add(parts[0]);
    }
  }

  const email = participant.email?.trim().toLowerCase();
  if (email) {
    values.add(email);
    const [local] = email.split("@");
    if (local) {
      values.add(normaliseKey(local));
    }
  }

  return values;
}

function matchParticipant(
  label: string,
  participants: MeetingParticipantRecord[],
): MeetingParticipantRecord | undefined {
  const key = normaliseKey(label);
  if (!key) {
    return undefined;
  }

  const exact = participants.filter((participant) => participantMatchKeys(participant).has(key));
  if (exact.length === 1) {
    return exact[0];
  }

  const fuzzy = participants.filter((participant) => {
    const participantKey = normaliseKey(participant.label);
    return participantKey.includes(key) || key.includes(participantKey);
  });
  if (fuzzy.length === 1) {
    return fuzzy[0];
  }

  return undefined;
}

function wordCount(text: string): number {
  const words = text.trim().match(/\b[\p{L}\p{N}'’-]+\b/gu);
  return words?.length ?? 0;
}

function speakerId(label: string): string {
  return `speaker:${sanitiseFilename(label.toLowerCase(), "speaker")}`;
}

export function buildTranscriptSpeakers(
  segments: Array<Pick<TranscriptSegment, "source" | "startTimestamp" | "endTimestamp" | "text">>,
  people?: GranolaMeetingPeople,
): MeetingSpeakerRecord[] {
  const participants = uniqueParticipants(people);
  const creator = participants.find((participant) => participant.role === "creator");
  const speakers = new Map<string, MeetingSpeakerRecord>();

  for (const segment of segments) {
    const label = transcriptSpeakerLabel(segment as TranscriptSegment);
    const existing = speakers.get(label);
    const matchedParticipant =
      label === "You"
        ? creator
        : label === "System"
          ? undefined
          : matchParticipant(label, participants);
    const role =
      label === "You"
        ? "self"
        : label === "System"
          ? "system"
          : (matchedParticipant?.role ?? "unknown");

    if (!existing) {
      speakers.set(label, {
        firstTimestamp: segment.startTimestamp,
        id: speakerId(label),
        label,
        lastTimestamp: segment.endTimestamp,
        matchedParticipantEmail: matchedParticipant?.email,
        matchedParticipantId: matchedParticipant?.id,
        matchedParticipantLabel: matchedParticipant?.label,
        role,
        segmentCount: 1,
        source: segment.source,
        wordCount: wordCount(segment.text),
      });
      continue;
    }

    existing.segmentCount += 1;
    existing.wordCount += wordCount(segment.text);
    if (segment.startTimestamp < existing.firstTimestamp) {
      existing.firstTimestamp = segment.startTimestamp;
    }
    if (segment.endTimestamp > existing.lastTimestamp) {
      existing.lastTimestamp = segment.endTimestamp;
    }
    if (!existing.matchedParticipantId && matchedParticipant) {
      existing.matchedParticipantEmail = matchedParticipant.email;
      existing.matchedParticipantId = matchedParticipant.id;
      existing.matchedParticipantLabel = matchedParticipant.label;
      existing.role = role;
    }
  }

  return [...speakers.values()].sort((left, right) => {
    return (
      compareStrings(left.firstTimestamp, right.firstTimestamp) ||
      compareStrings(left.label, right.label)
    );
  });
}

export function buildMeetingRoleHelpers(
  people: GranolaMeetingPeople | undefined,
  speakers: MeetingSpeakerRecord[],
): MeetingRoleHelpersRecord {
  const participants = uniqueParticipants(people);
  const creator = participants.find((participant) => participant.role === "creator");
  const ownerCandidates: MeetingOwnerCandidateRecord[] = [];
  const seen = new Set<string>();

  const addOwnerCandidate = (candidate: MeetingOwnerCandidateRecord): void => {
    const key = candidate.email?.toLowerCase() || normaliseKey(candidate.label);
    if (!key || seen.has(key)) {
      return;
    }

    seen.add(key);
    ownerCandidates.push(candidate);
  };

  for (const speaker of speakers) {
    if (speaker.role === "system") {
      continue;
    }

    const matchedParticipant =
      participants.find((participant) => participant.id === speaker.matchedParticipantId) ||
      (speaker.role === "self" ? creator : undefined) ||
      matchParticipant(speaker.label, participants);

    addOwnerCandidate({
      email: matchedParticipant?.email ?? speaker.matchedParticipantEmail,
      id: matchedParticipant?.id ?? speaker.matchedParticipantId ?? speaker.id,
      label: matchedParticipant?.label ?? speaker.matchedParticipantLabel ?? speaker.label,
      role: speaker.role,
      source: "speaker",
    });
  }

  if (ownerCandidates.length === 0) {
    for (const participant of participants) {
      addOwnerCandidate({
        email: participant.email,
        id: participant.id,
        label: participant.label,
        role: participant.role,
        source: "participant",
      });
    }
  }

  return {
    ownerCandidates: ownerCandidates.sort((left, right) => compareStrings(left.label, right.label)),
    participants,
    speakers: speakers.map((speaker) => ({ ...speaker })),
  };
}

export function resolveMeetingOwnerCandidate(
  owner: string | undefined,
  roleHelpers?: MeetingRoleHelpersRecord,
): {
  owner?: string;
  ownerEmail?: string;
  ownerOriginal?: string;
  ownerRole?: MeetingSpeakerRecord["role"];
} {
  const trimmed = owner?.trim();
  if (!trimmed) {
    return {};
  }

  const candidates = roleHelpers?.ownerCandidates ?? [];
  if (candidates.length === 0) {
    return { owner: trimmed };
  }

  const ownerKey = normaliseKey(trimmed);
  const selfCandidate = candidates.find((candidate) => candidate.role === "self");
  if (["i", "me", "myself", "you"].includes(ownerKey) && selfCandidate) {
    return {
      owner: selfCandidate.label,
      ownerEmail: selfCandidate.email,
      ownerOriginal: trimmed,
      ownerRole: selfCandidate.role,
    };
  }

  const matches = candidates.filter((candidate) => {
    const labelKey = normaliseKey(candidate.label);
    const emailKey = candidate.email?.toLowerCase();
    return (
      labelKey === ownerKey ||
      labelKey.includes(ownerKey) ||
      ownerKey.includes(labelKey) ||
      emailKey === ownerKey ||
      emailKey?.startsWith(`${ownerKey}@`)
    );
  });
  if (matches.length === 1) {
    return {
      owner: matches[0]!.label,
      ownerEmail: matches[0]!.email,
      ownerOriginal: trimmed === matches[0]!.label ? undefined : trimmed,
      ownerRole: matches[0]!.role,
    };
  }

  return { owner: trimmed };
}
