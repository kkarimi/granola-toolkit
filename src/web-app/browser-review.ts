import type { SetStoreFunction } from "solid-js/store";

import type { GranolaAutomationArtefact } from "../app/index.ts";
import { buildGranolaReviewInbox, summariseGranolaReviewInbox } from "../review-inbox.ts";
import type { GranolaReviewInboxItem } from "../review-inbox.ts";
import type { GranolaServerClient } from "../server/client.ts";

import type { WebStatusTone } from "./components.tsx";
import type { GranolaWebAppState } from "./types.ts";

interface WebReviewControllerDeps {
  clientAccessor: () => GranolaServerClient | null;
  setState: SetStoreFunction<GranolaWebAppState>;
  setStatus: (label: string, tone?: WebStatusTone) => void;
  state: GranolaWebAppState;
}

export function useReviewController({
  clientAccessor,
  setState,
  setStatus,
  state,
}: WebReviewControllerDeps) {
  const loadAutomationRuns = async () => {
    const client = clientAccessor();
    if (!client) {
      return;
    }

    try {
      const result = await client.listAutomationRuns({ limit: 20 });
      setState("automationRuns", result.runs);
    } catch (error) {
      setState("detailError", error instanceof Error ? error.message : String(error));
    }
  };

  const loadAutomationRules = async () => {
    const client = clientAccessor();
    if (!client) {
      return;
    }

    try {
      const result = await client.listAutomationRules();
      setState("automationRules", result.rules);
    } catch (error) {
      setState("detailError", error instanceof Error ? error.message : String(error));
      setState("automationRules", []);
    }
  };

  const clearAutomationArtefactPublishPreview = () => {
    setState("automationArtefactPublishPreview", null);
    setState("automationArtefactPublishPreviewError", "");
    setState("automationArtefactPublishPreviewLoading", false);
    setState("selectedPkmTargetId", null);
  };

  const loadPkmTargets = async () => {
    const client = clientAccessor();
    if (!client) {
      return;
    }

    try {
      const result = await client.listPkmTargets();
      setState("pkmTargets", result.targets);
      if (
        state.selectedPkmTargetId &&
        !result.targets.some((target) => target.id === state.selectedPkmTargetId)
      ) {
        setState("selectedPkmTargetId", null);
      }
    } catch (error) {
      setState("detailError", error instanceof Error ? error.message : String(error));
      setState("pkmTargets", []);
    }
  };

  const loadAutomationArtefactPublishPreview = async (
    options: { artefactId?: string | null; targetId?: string | null } = {},
  ) => {
    const client = clientAccessor();
    const artefactId = options.artefactId ?? state.selectedAutomationArtefactId;
    if (!client || !artefactId) {
      clearAutomationArtefactPublishPreview();
      return;
    }

    setState("automationArtefactPublishPreviewLoading", true);
    setState("automationArtefactPublishPreviewError", "");
    try {
      const result = await client.previewAutomationArtefactPublish(artefactId, {
        targetId: options.targetId ?? state.selectedPkmTargetId ?? undefined,
      });
      setState("automationArtefactPublishPreview", result);
      setState("selectedPkmTargetId", result.selectedTargetId ?? null);
    } catch (error) {
      clearAutomationArtefactPublishPreview();
      setState(
        "automationArtefactPublishPreviewError",
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setState("automationArtefactPublishPreviewLoading", false);
    }
  };

  const applySelectedArtefactDrafts = (artefact: GranolaAutomationArtefact | null) => {
    setState("selectedAutomationArtefactId", artefact?.id ?? null);
    setState("automationArtefactDraftTitle", artefact?.structured.title ?? "");
    setState("automationArtefactDraftSummary", artefact?.structured.summary ?? "");
    setState("automationArtefactDraftMarkdown", artefact?.structured.markdown ?? "");
    setState("reviewNote", "");
    if (!artefact) {
      clearAutomationArtefactPublishPreview();
    }
  };

  const syncSelectedArtefact = (
    artefacts: GranolaAutomationArtefact[],
    options: {
      preferredId?: string | null;
      preferredMeetingId?: string | null;
    } = {},
  ) => {
    const preferred =
      (options.preferredId
        ? artefacts.find((candidate) => candidate.id === options.preferredId)
        : undefined) ??
      (options.preferredMeetingId
        ? artefacts.find(
            (candidate) =>
              candidate.meetingId === options.preferredMeetingId &&
              candidate.status === "generated",
          )
        : undefined) ??
      artefacts.find((candidate) => candidate.status === "generated") ??
      artefacts[0];

    applySelectedArtefactDrafts(preferred ?? null);
    return preferred ?? null;
  };

  const loadAutomationArtefacts = async (
    options: {
      preferredId?: string | null;
      preferredMeetingId?: string | null;
    } = {},
  ) => {
    const client = clientAccessor();
    if (!client) {
      return;
    }

    try {
      setState("automationArtefactError", "");
      const result = await client.listAutomationArtefacts({ limit: 30 });
      setState("automationArtefacts", result.artefacts);
      const preferred = syncSelectedArtefact(result.artefacts, {
        preferredId: options.preferredId ?? state.selectedAutomationArtefactId,
        preferredMeetingId: options.preferredMeetingId ?? state.selectedMeetingId,
      });
      await loadAutomationArtefactPublishPreview({
        artefactId: preferred?.id ?? null,
        targetId: state.selectedPkmTargetId,
      });
    } catch (error) {
      setState("automationArtefactError", error instanceof Error ? error.message : String(error));
      setState("automationArtefacts", []);
      syncSelectedArtefact([]);
      clearAutomationArtefactPublishPreview();
    }
  };

  const loadProcessingIssues = async () => {
    const client = clientAccessor();
    if (!client) {
      return;
    }

    try {
      setState("processingIssueError", "");
      const result = await client.listProcessingIssues({ limit: 20 });
      setState("processingIssues", result.issues);
    } catch (error) {
      setState("processingIssueError", error instanceof Error ? error.message : String(error));
      setState("processingIssues", []);
    }
  };

  const reviewInboxItems = (): GranolaReviewInboxItem[] =>
    buildGranolaReviewInbox({
      artefacts: state.automationArtefacts,
      issues: state.processingIssues,
      runs: state.automationRuns,
    });

  const reviewInboxSummary = () => summariseGranolaReviewInbox(reviewInboxItems());

  const selectedReviewInboxItem = () =>
    reviewInboxItems().find((item) => item.key === state.selectedReviewInboxKey) ??
    reviewInboxItems()[0] ??
    null;

  const selectedReviewIssue = () => {
    const item = selectedReviewInboxItem();
    return item?.kind === "issue" ? item.issue : null;
  };

  const selectedReviewRun = () => {
    const item = selectedReviewInboxItem();
    return item?.kind === "run" ? item.request : null;
  };

  const selectedAutomationArtefact = () =>
    state.automationArtefacts.find(
      (artefact) => artefact.id === state.selectedAutomationArtefactId,
    ) || null;

  const selectedReviewArtefact = () => {
    const item = selectedReviewInboxItem();
    return item?.kind === "artefact" ? item.draft : selectedAutomationArtefact();
  };

  const selectAutomationArtefactPublishTarget = async (targetId: string | null) => {
    setState("selectedPkmTargetId", targetId);
    await loadAutomationArtefactPublishPreview({
      artefactId: state.selectedAutomationArtefactId,
      targetId,
    });
  };

  const resolveAutomationRun = async (id: string, decision: "approve" | "reject") => {
    const client = clientAccessor();
    if (!client) {
      return;
    }

    setStatus(decision === "approve" ? "Approving automation…" : "Rejecting automation…", "busy");
    try {
      await client.resolveAutomationRun(id, decision);
    } catch (error) {
      setState("detailError", error instanceof Error ? error.message : String(error));
      setStatus("Automation decision failed", "error");
      throw error;
    }
  };

  const recoverProcessingIssue = async (id: string) => {
    const client = clientAccessor();
    if (!client) {
      return;
    }

    setStatus("Recovering processing issue…", "busy");
    try {
      const result = await client.recoverProcessingIssue(id);
      setStatus(
        result.runCount > 0
          ? `Recovered ${result.issue.kind} and re-ran ${result.runCount} pipeline${result.runCount === 1 ? "" : "s"}`
          : `Recovered ${result.issue.kind}`,
        "ok",
      );
    } catch (error) {
      setState("processingIssueError", error instanceof Error ? error.message : String(error));
      setStatus("Recovery failed", "error");
      throw error;
    }
  };

  const selectAutomationArtefact = async (
    id: string,
    options: {
      loadMeeting?: (meetingId: string) => Promise<void>;
    } = {},
  ) => {
    const client = clientAccessor();
    if (!client) {
      return;
    }

    try {
      const artefact =
        state.automationArtefacts.find((candidate) => candidate.id === id) ??
        (await client.getAutomationArtefact(id));
      setState("selectedReviewInboxKey", `artefact:${artefact.id}`);
      applySelectedArtefactDrafts(artefact);
      await loadAutomationArtefactPublishPreview({
        artefactId: artefact.id,
        targetId: state.selectedPkmTargetId,
      });
      if (artefact.meetingId !== state.selectedMeetingId && options.loadMeeting) {
        await options.loadMeeting(artefact.meetingId);
      }
    } catch (error) {
      setState("automationArtefactError", error instanceof Error ? error.message : String(error));
      setStatus("Unable to open artefact", "error");
    }
  };

  const saveAutomationArtefact = async () => {
    const client = clientAccessor();
    if (!client || !state.selectedAutomationArtefactId) {
      return;
    }

    setStatus("Saving artefact edits…", "busy");
    try {
      const artefact = await client.updateAutomationArtefact(state.selectedAutomationArtefactId, {
        markdown: state.automationArtefactDraftMarkdown,
        note: state.reviewNote || undefined,
        summary: state.automationArtefactDraftSummary,
        title: state.automationArtefactDraftTitle,
      });
      await loadAutomationArtefacts({
        preferredId: artefact.id,
        preferredMeetingId: artefact.meetingId,
      });
      await loadAutomationRuns();
      setStatus("Artefact updated", "ok");
    } catch (error) {
      setState("automationArtefactError", error instanceof Error ? error.message : String(error));
      setStatus("Artefact save failed", "error");
    }
  };

  const resolveAutomationArtefact = async (decision: "approve" | "reject") => {
    const client = clientAccessor();
    if (!client || !state.selectedAutomationArtefactId) {
      return;
    }

    setStatus(decision === "approve" ? "Approving artefact…" : "Rejecting artefact…", "busy");
    try {
      const artefact = await client.resolveAutomationArtefact(
        state.selectedAutomationArtefactId,
        decision,
        {
          note: state.reviewNote || undefined,
          targetId: state.selectedPkmTargetId || undefined,
        },
      );
      await loadAutomationArtefacts({
        preferredId: artefact.id,
        preferredMeetingId: artefact.meetingId,
      });
      await loadAutomationRuns();
      setStatus(decision === "approve" ? "Artefact approved" : "Artefact rejected", "ok");
    } catch (error) {
      setState("automationArtefactError", error instanceof Error ? error.message : String(error));
      setStatus("Artefact decision failed", "error");
    }
  };

  const rerunAutomationArtefact = async () => {
    const client = clientAccessor();
    if (!client || !state.selectedAutomationArtefactId) {
      return;
    }

    setStatus("Rerunning artefact pipeline…", "busy");
    try {
      const artefact = await client.rerunAutomationArtefact(state.selectedAutomationArtefactId);
      await loadAutomationArtefacts({
        preferredId: artefact.id,
        preferredMeetingId: artefact.meetingId,
      });
      await loadAutomationRuns();
      setStatus("Artefact rerun complete", "ok");
    } catch (error) {
      setState("automationArtefactError", error instanceof Error ? error.message : String(error));
      setStatus("Artefact rerun failed", "error");
    }
  };

  const selectReviewInboxItem = async (
    key: string,
    options: {
      loadMeeting: (meetingId: string) => Promise<void>;
    },
  ) => {
    setState("selectedReviewInboxKey", key);
    const item = reviewInboxItems().find((candidate) => candidate.key === key);
    if (!item) {
      return;
    }

    try {
      if (item.kind === "artefact") {
        await selectAutomationArtefact(item.draft.id, {
          loadMeeting: options.loadMeeting,
        });
        return;
      }

      clearAutomationArtefactPublishPreview();

      if (item.meetingId && item.meetingId !== state.selectedMeetingId) {
        await options.loadMeeting(item.meetingId);
      }
    } catch (error) {
      setState("detailError", error instanceof Error ? error.message : String(error));
      setStatus("Unable to open review item", "error");
    }
  };

  return {
    applySelectedArtefactDrafts,
    loadAutomationArtefacts,
    loadAutomationArtefactPublishPreview,
    loadPkmTargets,
    loadAutomationRules,
    loadAutomationRuns,
    loadProcessingIssues,
    recoverProcessingIssue,
    resolveAutomationArtefact,
    resolveAutomationRun,
    reviewInboxItems,
    reviewInboxSummary,
    rerunAutomationArtefact,
    saveAutomationArtefact,
    selectAutomationArtefact,
    selectAutomationArtefactPublishTarget,
    selectReviewInboxItem,
    selectedAutomationArtefact,
    selectedReviewArtefact,
    selectedReviewInboxItem,
    selectedReviewIssue,
    selectedReviewRun,
    syncSelectedArtefact,
  };
}
