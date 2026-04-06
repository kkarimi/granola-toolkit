import { matchesKey } from "@mariozechner/pi-tui";

import type { GranolaTuiFocusPane, GranolaTuiWorkspaceTab } from "./types.ts";

interface GranolaTuiWorkspaceInputActions {
  activePane: GranolaTuiFocusPane;
  cycleTab: (delta: number) => void;
  exit: () => void;
  moveSelection: (delta: number) => void;
  openAuth: () => void;
  openAutomation: () => void;
  openQuickOpen: () => void;
  refresh: (forceRefresh: boolean) => void;
  requestRender: () => void;
  scrollDetail: (delta: number) => void;
  scrollStep: () => number;
  selectTab: (tab: GranolaTuiWorkspaceTab) => void;
  setActivePane: (pane: GranolaTuiFocusPane) => void;
}

export function handleWorkspaceInput(
  data: string,
  actions: GranolaTuiWorkspaceInputActions,
): boolean {
  if (matchesKey(data, "ctrl+c") || matchesKey(data, "q")) {
    actions.exit();
    return true;
  }

  if (matchesKey(data, "r")) {
    actions.refresh(true);
    return true;
  }

  if (matchesKey(data, "/") || matchesKey(data, "ctrl+p")) {
    actions.openQuickOpen();
    return true;
  }

  if (matchesKey(data, "a")) {
    actions.openAuth();
    return true;
  }

  if (matchesKey(data, "u")) {
    actions.openAutomation();
    return true;
  }

  if (matchesKey(data, "tab")) {
    actions.setActivePane(actions.activePane === "folders" ? "meetings" : "folders");
    actions.requestRender();
    return true;
  }

  if (matchesKey(data, "left") || matchesKey(data, "h")) {
    actions.setActivePane("folders");
    actions.requestRender();
    return true;
  }

  if (matchesKey(data, "right") || matchesKey(data, "l")) {
    actions.setActivePane("meetings");
    actions.requestRender();
    return true;
  }

  if (matchesKey(data, "up") || matchesKey(data, "k")) {
    actions.moveSelection(-1);
    return true;
  }

  if (matchesKey(data, "down") || matchesKey(data, "j")) {
    actions.moveSelection(1);
    return true;
  }

  if (matchesKey(data, "pageUp")) {
    actions.scrollDetail(-Math.max(1, actions.scrollStep()));
    return true;
  }

  if (matchesKey(data, "pageDown")) {
    actions.scrollDetail(actions.scrollStep());
    return true;
  }

  if (matchesKey(data, "1")) {
    actions.selectTab("notes");
    return true;
  }

  if (matchesKey(data, "2")) {
    actions.selectTab("transcript");
    return true;
  }

  if (matchesKey(data, "3")) {
    actions.selectTab("metadata");
    return true;
  }

  if (matchesKey(data, "4")) {
    actions.selectTab("raw");
    return true;
  }

  if (matchesKey(data, "]")) {
    actions.cycleTab(1);
    return true;
  }

  if (matchesKey(data, "[")) {
    actions.cycleTab(-1);
    return true;
  }

  return false;
}
