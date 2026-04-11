import type { SetStoreFunction } from "solid-js/store";

import type { GranolaAgentHarness } from "../app/index.ts";
import type { GranolaServerClient } from "../server/client.ts";

import { createHarnessTemplate, duplicateHarnessTemplate } from "./harness-editor.tsx";
import { buildStarterPipeline } from "./onboarding.tsx";
import type { GranolaWebAppState, GranolaWebBrowserConfig } from "./types.ts";
import type { WebStatusTone } from "./components.tsx";

interface WebBrowserHookDeps {
  setState: SetStoreFunction<GranolaWebAppState>;
  setStatus: (label: string, tone?: WebStatusTone) => void;
  state: GranolaWebAppState;
}

interface WebHarnessControllerDeps extends WebBrowserHookDeps {
  clientAccessor: () => GranolaServerClient | null;
}

export function browserConfig(): GranolaWebBrowserConfig {
  return {
    passwordRequired: Boolean(window.__GRANOLA_SERVER__?.passwordRequired),
  };
}
export function useHarnessController({
  clientAccessor,
  setState,
  setStatus,
  state,
}: WebHarnessControllerDeps) {
  const selectHarnessId = (harnesses: GranolaAgentHarness[], preferredId?: string | null) => {
    if (preferredId && harnesses.some((harness) => harness.id === preferredId)) {
      return preferredId;
    }

    return harnesses[0]?.id ?? null;
  };

  const selectedHarness = () =>
    state.harnesses.find((harness) => harness.id === state.selectedHarnessId) ?? null;

  const loadHarnessExplanations = async (meetingId: string | null) => {
    const client = clientAccessor();
    if (!client || !meetingId) {
      setState("harnessExplainEventKind", null);
      setState("harnessExplanations", []);
      return;
    }

    try {
      const result = await client.explainAgentHarnesses(meetingId);
      setState("harnessExplainEventKind", result.eventKind);
      setState("harnessExplanations", result.harnesses);
    } catch (error) {
      setState("harnessExplainEventKind", null);
      setState("harnessExplanations", []);
      setState("harnessError", error instanceof Error ? error.message : String(error));
    }
  };

  const loadHarnesses = async (preferredId?: string | null) => {
    const client = clientAccessor();
    if (!client) {
      return;
    }

    try {
      setState("harnessError", "");
      const result = await client.listAgentHarnesses();
      const nextSelectedHarnessId = selectHarnessId(
        result.harnesses,
        preferredId ?? state.selectedHarnessId,
      );
      setState("harnesses", result.harnesses);
      setState("selectedHarnessId", nextSelectedHarnessId);
      const nextPreferredProvider = result.harnesses.find((harness) => harness.provider)?.provider;
      if (nextPreferredProvider) {
        setState("preferredProvider", nextPreferredProvider);
      }
      setState("harnessDirty", false);
      setState("harnessTestResult", null);
      await loadHarnessExplanations(state.selectedMeetingId);
    } catch (error) {
      setState("harnessError", error instanceof Error ? error.message : String(error));
      setState("harnesses", []);
      setState("selectedHarnessId", null);
      setState("harnessExplainEventKind", null);
      setState("harnessExplanations", []);
      setState("harnessTestResult", null);
    }
  };

  const updateHarness = (nextHarness: GranolaAgentHarness) => {
    setState(
      "harnesses",
      state.harnesses.map((harness) => (harness.id === nextHarness.id ? nextHarness : harness)),
    );
    setState("selectedHarnessId", nextHarness.id);
    setState("harnessDirty", true);
    setState("harnessTestResult", null);
  };

  const createHarness = () => {
    const nextHarness = createHarnessTemplate(state.harnesses);
    setState("harnesses", [...state.harnesses, nextHarness]);
    setState("selectedHarnessId", nextHarness.id);
    setState("harnessDirty", true);
    setState("harnessTestResult", null);
  };

  const duplicateHarness = () => {
    const harness = selectedHarness();
    if (!harness) {
      return;
    }

    const nextHarness = duplicateHarnessTemplate(state.harnesses, harness);
    setState("harnesses", [...state.harnesses, nextHarness]);
    setState("selectedHarnessId", nextHarness.id);
    setState("harnessDirty", true);
    setState("harnessTestResult", null);
  };

  const removeHarness = () => {
    if (!state.selectedHarnessId) {
      return;
    }

    const nextHarnesses = state.harnesses.filter(
      (harness) => harness.id !== state.selectedHarnessId,
    );
    setState("harnesses", nextHarnesses);
    setState("selectedHarnessId", selectHarnessId(nextHarnesses, null));
    setState("harnessDirty", true);
    setState("harnessTestResult", null);
  };

  const saveHarnesses = async () => {
    const client = clientAccessor();
    if (!client) {
      return;
    }

    setStatus("Saving harnesses…", "busy");
    try {
      const result = await client.saveAgentHarnesses(state.harnesses);
      const nextSelectedHarnessId = selectHarnessId(result.harnesses, state.selectedHarnessId);
      setState("harnesses", result.harnesses);
      setState("selectedHarnessId", nextSelectedHarnessId);
      const nextPreferredProvider = result.harnesses.find((harness) => harness.provider)?.provider;
      if (nextPreferredProvider) {
        setState("preferredProvider", nextPreferredProvider);
      }
      setState("harnessDirty", false);
      setState("harnessError", "");
      await loadHarnessExplanations(state.selectedMeetingId);
      setStatus("Harnesses saved", "ok");
    } catch (error) {
      setState("harnessError", error instanceof Error ? error.message : String(error));
      setStatus("Harness save failed", "error");
    }
  };

  const reloadHarnesses = async () => {
    setStatus("Reloading harnesses…", "busy");
    await loadHarnesses(state.selectedHarnessId);
    setStatus("Harnesses reloaded", "ok");
  };

  const createStarterPipeline = async (refreshAll: () => Promise<void>) => {
    const client = clientAccessor();
    if (!client) {
      return;
    }

    setStatus("Creating starter pipeline…", "busy");
    try {
      const [currentHarnesses, currentRules] = await Promise.all([
        client.listAgentHarnesses(),
        client.listAutomationRules(),
      ]);
      const starter = buildStarterPipeline({
        harnesses: currentHarnesses.harnesses,
        provider: state.preferredProvider,
        rules: currentRules.rules,
      });

      await client.saveAgentHarnesses(starter.harnesses);
      await client.saveAutomationRules(starter.rules);
      await refreshAll();
      setStatus("Starter pipeline ready", "ok");
    } catch (error) {
      setState("detailError", error instanceof Error ? error.message : String(error));
      setStatus("Starter pipeline setup failed", "error");
    }
  };

  const testHarness = async () => {
    const client = clientAccessor();
    if (!client) {
      return;
    }

    const harness = selectedHarness();
    if (!harness) {
      setStatus("Select a harness first", "error");
      return;
    }

    const meetingId = state.selectedMeetingId;
    if (!meetingId) {
      setStatus("Select a meeting first", "error");
      return;
    }

    setStatus("Testing harness…", "busy");
    try {
      const bundle =
        state.selectedMeetingBundle?.source.document.id === meetingId
          ? state.selectedMeetingBundle
          : await client.getMeeting(meetingId, { requireCache: true });
      const result = await client.evaluateAutomationCases(
        [
          {
            bundle,
            id: `web:${meetingId}`,
            title:
              bundle.meeting.meeting.title ||
              bundle.source.document.title ||
              bundle.source.document.id,
          },
        ],
        {
          harnessIds: [harness.id],
          kind: state.harnessTestKind,
          model: harness.model,
          provider: harness.provider,
        },
      );
      setState("harnessTestResult", result.results[0] ?? null);
      setStatus("Harness test complete", "ok");
    } catch (error) {
      setState("harnessTestResult", {
        caseId: `web:${meetingId}`,
        caseTitle: state.selectedMeeting?.meeting.title || meetingId,
        error: error instanceof Error ? error.message : String(error),
        harnessId: harness.id,
        harnessName: harness.name,
        prompt: "",
        status: "failed",
      });
      setStatus("Harness test failed", "error");
    }
  };

  return {
    createHarness,
    createStarterPipeline,
    duplicateHarness,
    loadHarnessExplanations,
    loadHarnesses,
    reloadHarnesses,
    removeHarness,
    saveHarnesses,
    selectedHarness,
    testHarness,
    updateHarness,
  };
}
