import {
  buildBrowserUrlPath,
  buildMeetingsQuery,
  buildNotesExportRequest,
  buildTranscriptsExportRequest,
  currentFilterSummary,
  exportScopeLabel,
  nextWorkspaceTab,
  parseWorkspaceTab,
  selectMeetingId,
  startupSelectionFromSearch,
} from "./client-state.ts";

export const granolaWebClientScript = String.raw`
const serverConfig = window.__GRANOLA_SERVER__ || { passwordRequired: false };
const workspaceTabs = ["notes", "transcript", "metadata", "raw"];
${parseWorkspaceTab.toString()}
${startupSelectionFromSearch.toString()}
${buildBrowserUrlPath.toString()}
${exportScopeLabel.toString()}
${currentFilterSummary.toString()}
${selectMeetingId.toString()}
${buildMeetingsQuery.toString()}
${buildNotesExportRequest.toString()}
${buildTranscriptsExportRequest.toString()}
${nextWorkspaceTab.toString()}

const state = {
  appState: null,
  detailError: "",
  folderError: "",
  folders: [],
  listError: "",
  meetings: [],
  quickOpen: "",
  search: "",
  selectedFolderId: null,
  selectedMeeting: null,
  selectedMeetingBundle: null,
  selectedMeetingId: null,
  meetingSource: "live",
  serverLocked: Boolean(serverConfig.passwordRequired),
  sort: "updated-desc",
  updatedFrom: "",
  updatedTo: "",
  workspaceTab: "notes",
};

const els = {
  appState: document.querySelector("[data-app-state]"),
  authPanel: document.querySelector("[data-auth-panel]"),
  detailBody: document.querySelector("[data-detail-body]"),
  detailMeta: document.querySelector("[data-detail-meta]"),
  empty: document.querySelector("[data-empty]"),
  folderList: document.querySelector("[data-folder-list]"),
  jobsList: document.querySelector("[data-jobs-list]"),
  list: document.querySelector("[data-meeting-list]"),
  noteButton: document.querySelector("[data-export-notes]"),
  quickOpen: document.querySelector("[data-quick-open]"),
  quickOpenButton: document.querySelector("[data-quick-open-button]"),
  refreshButton: document.querySelector("[data-refresh]"),
  search: document.querySelector("[data-search]"),
  securityPanel: document.querySelector("[data-security-panel]"),
  serverPassword: document.querySelector("[data-server-password]"),
  lockServerButton: document.querySelector("[data-lock-server]"),
  sort: document.querySelector("[data-sort]"),
  stateBadge: document.querySelector("[data-state-badge]"),
  transcriptButton: document.querySelector("[data-export-transcripts]"),
  unlockServerButton: document.querySelector("[data-unlock-server]"),
  updatedFrom: document.querySelector("[data-updated-from]"),
  updatedTo: document.querySelector("[data-updated-to]"),
  workspaceTabs: document.querySelectorAll("[data-workspace-tab]"),
};

function syncBrowserUrl() {
  const nextPath = buildBrowserUrlPath(window.location.href, {
    selectedFolderId: state.selectedFolderId,
    selectedMeetingId: state.selectedMeetingId,
    workspaceTab: state.workspaceTab,
  });
  const currentPath = window.location.pathname + window.location.search + window.location.hash;
  if (nextPath !== currentPath) {
    history.replaceState(null, "", nextPath);
  }
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function setStatus(label, tone = "idle") {
  els.stateBadge.textContent = label;
  els.stateBadge.dataset.tone = tone;
}

function syncFilterInputs() {
  els.quickOpen.value = state.quickOpen;
  els.search.value = state.search;
  els.sort.value = state.sort;
  els.updatedFrom.value = state.updatedFrom;
  els.updatedTo.value = state.updatedTo;
}

function renderWorkspaceTabs() {
  for (const button of els.workspaceTabs) {
    button.dataset.selected = button.dataset.workspaceTab === state.workspaceTab ? "true" : "false";
  }
}

function renderAppState() {
  if (!state.appState) {
    els.appState.innerHTML = "<p>Waiting for server state…</p>";
    els.authPanel.innerHTML = "<p>Waiting for auth state…</p>";
    renderSecurityPanel();
    return;
  }

  const appState = state.appState;
  const authMode = appState.auth.mode === "stored-session" ? "Stored session" : "supabase.json";
  const docs = appState.documents.loaded ? String(appState.documents.count) : "not loaded";
  const cache = appState.cache.loaded
    ? appState.cache.transcriptCount + " transcript sets"
    : appState.cache.configured
      ? "configured"
      : "not configured";
  const indexStatus = appState.index.loaded
    ? appState.index.meetingCount + " meetings"
    : appState.index.available
      ? "available"
      : "not built";
  const folderStatus = appState.folders.loaded
    ? appState.folders.count + " folders"
    : "not loaded";
  const syncStatus = appState.sync.running
    ? "running"
    : appState.sync.lastError
      ? "error"
      : appState.sync.lastCompletedAt
        ? "last " + appState.sync.lastCompletedAt.slice(11, 19)
        : "idle";

  els.appState.innerHTML = [
    '<div class="status-grid">',
    '<div><span class="status-label">Surface</span><strong>' + escapeHtml(appState.ui.surface) + "</strong></div>",
    '<div><span class="status-label">View</span><strong>' + escapeHtml(appState.ui.view) + "</strong></div>",
    '<div><span class="status-label">Auth</span><strong>' + escapeHtml(authMode) + "</strong></div>",
    '<div><span class="status-label">Sync</span><strong>' + escapeHtml(syncStatus) + "</strong></div>",
    '<div><span class="status-label">Documents</span><strong>' + escapeHtml(docs) + "</strong></div>",
    '<div><span class="status-label">Folders</span><strong>' + escapeHtml(folderStatus) + "</strong></div>",
    '<div><span class="status-label">Cache</span><strong>' + escapeHtml(cache) + "</strong></div>",
    '<div><span class="status-label">Index</span><strong>' + escapeHtml(indexStatus) + "</strong></div>",
    "</div>",
  ].join("");

  renderSecurityPanel();
  renderAuthPanel();
  renderExportJobs();
}

function renderFolderList() {
  if (state.folderError) {
    els.folderList.innerHTML =
      '<div class="folder-empty folder-empty--error">' + escapeHtml(state.folderError) + "</div>";
    return;
  }

  const buttons = [
    [
      '<button class="folder-row"' +
        (state.selectedFolderId ? "" : ' data-selected="true"') +
        ' data-folder-id="">',
      '<span class="folder-row__title">All meetings</span>',
      '<span class="folder-row__meta">Browse the full meeting list.</span>',
      "</button>",
    ].join(""),
  ];

  for (const folder of state.folders) {
    buttons.push(
      [
        '<button class="folder-row"' +
          (folder.id === state.selectedFolderId ? ' data-selected="true"' : "") +
          ' data-folder-id="' +
          escapeHtml(folder.id) +
          '">',
        '<span class="folder-row__title">' +
          escapeHtml((folder.isFavourite ? "★ " : "") + (folder.name || folder.id)) +
          "</span>",
        '<span class="folder-row__meta">' +
          escapeHtml(String(folder.documentCount) + " meetings") +
          "</span>",
        "</button>",
      ].join(""),
    );
  }

  if (buttons.length === 1) {
    buttons.push('<div class="folder-empty">No folders found.</div>');
  }

  els.folderList.innerHTML = buttons.join("");
}

function renderSecurityPanel() {
  els.securityPanel.hidden = !state.serverLocked;
}

function authActionButton(label, action, disabled) {
  return (
    '<button class="button button--secondary" data-auth-action="' +
    escapeHtml(action) +
    '"' +
    (disabled ? " disabled" : "") +
    ">" +
    escapeHtml(label) +
    "</button>"
  );
}

function authModeButton(label, mode, disabled) {
  return (
    '<button class="button button--secondary" data-auth-mode="' +
    escapeHtml(mode) +
    '"' +
    (disabled ? " disabled" : "") +
    ">" +
    escapeHtml(label) +
    "</button>"
  );
}

function renderAuthPanel() {
  const auth = state.appState?.auth;
  if (!auth) {
    els.authPanel.innerHTML = '<div class="auth-card"><div class="auth-card__meta">Auth state unavailable.</div></div>';
    return;
  }

  const activeSource = auth.mode === "stored-session" ? "Stored session" : "supabase.json";
  const lastError = auth.lastError
    ? '<div class="auth-card__meta auth-card__error">' + escapeHtml(auth.lastError) + "</div>"
    : "";

  els.authPanel.innerHTML = [
    '<div class="auth-card">',
    '<div class="status-grid">',
    '<div><span class="status-label">Active</span><strong>' + escapeHtml(activeSource) + "</strong></div>",
    '<div><span class="status-label">Stored</span><strong>' + escapeHtml(auth.storedSessionAvailable ? "available" : "missing") + "</strong></div>",
    '<div><span class="status-label">supabase.json</span><strong>' + escapeHtml(auth.supabaseAvailable ? "available" : "missing") + "</strong></div>",
    '<div><span class="status-label">Refresh</span><strong>' + escapeHtml(auth.refreshAvailable ? "available" : "missing") + "</strong></div>",
    "</div>",
    auth.clientId
      ? '<div class="auth-card__meta">Client ID: ' + escapeHtml(auth.clientId) + "</div>"
      : "",
    auth.signInMethod
      ? '<div class="auth-card__meta">Sign-in method: ' + escapeHtml(auth.signInMethod) + "</div>"
      : "",
    auth.supabasePath
      ? '<div class="auth-card__meta">supabase path: ' + escapeHtml(auth.supabasePath) + "</div>"
      : "",
    lastError,
    '<div class="auth-card__actions">',
    authActionButton("Import desktop session", "login", !auth.supabaseAvailable),
    authActionButton("Refresh stored session", "refresh", !auth.storedSessionAvailable || !auth.refreshAvailable),
    authModeButton("Use stored session", "stored-session", !auth.storedSessionAvailable || auth.mode === "stored-session"),
    authModeButton("Use supabase.json", "supabase-file", !auth.supabaseAvailable || auth.mode === "supabase-file"),
    authActionButton("Sign out", "logout", !auth.storedSessionAvailable),
    "</div>",
    "</div>",
  ].join("");
}

function renderMeetingList() {
  if (state.listError) {
    els.list.innerHTML =
      '<div class="meeting-empty meeting-empty--error">' + escapeHtml(state.listError) + "</div>";
    return;
  }

  if (state.meetings.length === 0) {
    state.selectedMeetingId = null;
    state.selectedMeeting = null;
    state.selectedMeetingBundle = null;
    syncBrowserUrl();
    const filterSummary = currentFilterSummary({
      folders: state.folders,
      search: state.search,
      selectedFolderId: state.selectedFolderId,
      updatedFrom: state.updatedFrom,
      updatedTo: state.updatedTo,
    });
    const message = filterSummary
      ? "No meetings match " + filterSummary + "."
      : "No meetings yet. Try Sync now.";
    els.list.innerHTML = '<div class="meeting-empty">' + escapeHtml(message) + "</div>";
    renderMeetingDetail();
    return;
  }

  state.selectedMeetingId = selectMeetingId(state.meetings, state.selectedMeetingId);
  syncBrowserUrl();

  els.list.innerHTML = state.meetings
    .map((meeting) => {
      const selected = meeting.id === state.selectedMeetingId ? ' data-selected="true"' : "";
      const tags = meeting.tags.length ? meeting.tags.map((tag) => "#" + tag).join(" ") : "untagged";
      return [
        '<button class="meeting-row"' + selected + ' data-meeting-id="' + escapeHtml(meeting.id) + '">',
        '<span class="meeting-row__title">' + escapeHtml(meeting.title || meeting.id) + "</span>",
        '<span class="meeting-row__meta">' + escapeHtml(tags) + "</span>",
        '<span class="meeting-row__meta">' + escapeHtml(meeting.updatedAt.slice(0, 10) || "unknown") + "</span>",
        "</button>",
      ].join("");
    })
    .join("");
}

function renderMeetingDetail() {
  renderWorkspaceTabs();

  if (state.detailError) {
    els.empty.hidden = false;
    els.empty.textContent = state.detailError;
    els.detailMeta.innerHTML = "";
    els.detailBody.innerHTML = "";
    return;
  }

  const record = state.selectedMeeting;
  if (!record) {
    els.empty.hidden = false;
    els.empty.textContent = "Select a meeting to inspect its notes and transcript.";
    els.detailMeta.innerHTML = "";
    els.detailBody.innerHTML = "";
    return;
  }

  els.empty.hidden = true;
  els.detailMeta.innerHTML = [
    '<div class="detail-chip">ID: ' + escapeHtml(record.meeting.id) + "</div>",
    '<div class="detail-chip">Source: ' + escapeHtml(record.meeting.noteContentSource) + "</div>",
    '<div class="detail-chip">Transcript: ' + escapeHtml(String(record.meeting.transcriptSegmentCount)) + " segments</div>",
  ].join("");

  const bundle = state.selectedMeetingBundle;
  const metadataLines = [
    "Title: " + (record.meeting.title || record.meeting.id),
    "Created: " + record.meeting.createdAt,
    "Updated: " + record.meeting.updatedAt,
    "Folders: " + (record.meeting.folders.length ? record.meeting.folders.map((folder) => folder.name).join(", ") : "none"),
    "Tags: " + (record.meeting.tags.length ? record.meeting.tags.join(", ") : "none"),
    "Transcript loaded: " + (record.meeting.transcriptLoaded ? "yes" : "no"),
  ].join("\n");

  let mainTitle = "Notes";
  let mainBody = record.noteMarkdown || "";

  switch (state.workspaceTab) {
    case "transcript":
      mainTitle = "Transcript";
      mainBody = record.transcriptText || "(Transcript unavailable)";
      break;
    case "metadata":
      mainTitle = "Metadata";
      mainBody = metadataLines;
      break;
    case "raw":
      mainTitle = "Raw Bundle";
      mainBody = JSON.stringify(bundle || record, null, 2);
      break;
    default:
      break;
  }

  els.detailBody.innerHTML = [
    '<div class="workspace-grid">',
    '<aside class="detail-section workspace-sidebar">',
    "<h2>Meeting Metadata</h2>",
    '<pre class="detail-pre">' + escapeHtml(metadataLines) + "</pre>",
    "</aside>",
    '<section class="detail-section workspace-main">',
    "<h2>" + escapeHtml(mainTitle) + "</h2>",
    '<pre class="detail-pre">' + escapeHtml(mainBody) + "</pre>",
    "</section>",
    "</div>",
  ].join("");
}

function renderExportJobs() {
  const jobs = state.appState?.exports?.jobs || [];
  if (jobs.length === 0) {
    els.jobsList.innerHTML = '<div class="job-empty">No export jobs yet.</div>';
    return;
  }

  els.jobsList.innerHTML = jobs
    .slice(0, 6)
    .map((job) => {
      const progress = job.itemCount > 0
        ? job.completedCount + "/" + job.itemCount + " items"
        : "0 items";
      const error = job.error ? '<div class="job-card__meta">' + escapeHtml(job.error) + "</div>" : "";
      const rerunButton =
        job.status === "running"
          ? ""
          : '<button class="button button--secondary" data-rerun-job-id="' + escapeHtml(job.id) + '">Rerun</button>';

      return [
        '<article class="job-card">',
        '<div class="job-card__head">',
        '<div>',
        '<div class="job-card__title">' + escapeHtml(job.kind) + " export</div>",
        '<div class="job-card__meta">' + escapeHtml(job.id) + "</div>",
        "</div>",
        '<div class="job-card__status" data-status="' + escapeHtml(job.status) + '">' + escapeHtml(job.status) + "</div>",
        "</div>",
        '<div class="job-card__meta">Format: ' + escapeHtml(job.format) + " • " + escapeHtml(exportScopeLabel(job.scope)) + " • " + escapeHtml(progress) + " • Written: " + escapeHtml(String(job.written)) + "</div>",
        '<div class="job-card__meta">Started: ' + escapeHtml(job.startedAt.slice(0, 19)) + "</div>",
        '<div class="job-card__meta">Output: ' + escapeHtml(job.outputDir) + "</div>",
        error,
        '<div class="job-card__actions">' + rerunButton + "</div>",
        "</article>",
      ].join("");
    })
    .join("");
}

async function fetchJson(path, init) {
  const response = await fetch(path, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (payload.authRequired) {
      state.serverLocked = true;
      renderSecurityPanel();
    }

    const error = new Error(payload.error || response.statusText || "Request failed");
    error.authRequired = Boolean(payload.authRequired);
    throw error;
  }
  return payload;
}

async function loadFolders(options = {}) {
  const refresh = options.refresh === true;

  try {
    state.folderError = "";
    const params = new URLSearchParams();
    params.set("limit", "100");
    if (refresh) {
      params.set("refresh", "true");
    }

    const payload = await fetchJson("/folders?" + params.toString());
    state.folders = payload.folders || [];
    if (
      state.selectedFolderId &&
      !state.folders.some((folder) => folder.id === state.selectedFolderId)
    ) {
      state.selectedFolderId = null;
    }
  } catch (error) {
    if (error.authRequired) {
      throw error;
    }

    state.folderError = error instanceof Error ? error.message : String(error);
    state.folders = [];
    state.selectedFolderId = null;
  }

  renderFolderList();
  syncBrowserUrl();
}

async function loadMeetings(options = {}) {
  const preferredMeetingId = options.preferredMeetingId || state.selectedMeetingId;
  const refresh = options.refresh === true;

  try {
    state.listError = "";
    const payload = await fetchJson(
      "/meetings" +
        buildMeetingsQuery(
          {
            search: state.search,
            selectedFolderId: state.selectedFolderId,
            sort: state.sort,
            updatedFrom: state.updatedFrom,
            updatedTo: state.updatedTo,
          },
          {
            limit: 100,
            refresh,
          },
        ),
    );
    state.meetings = payload.meetings || [];
    state.meetingSource = payload.source || "live";

    if (preferredMeetingId && state.meetings.some((meeting) => meeting.id === preferredMeetingId)) {
      state.selectedMeetingId = preferredMeetingId;
    }

    renderMeetingList();
    if (state.selectedMeetingId) {
      await loadMeeting(state.selectedMeetingId);
      return;
    }

    state.detailError = "";
    renderMeetingDetail();
  } catch (error) {
    state.listError = error instanceof Error ? error.message : String(error);
    state.selectedMeeting = null;
    state.selectedMeetingBundle = null;
    state.detailError = state.listError;
    renderMeetingList();
    renderMeetingDetail();
  }
}

async function loadMeeting(id) {
  state.selectedMeetingId = id;
  syncBrowserUrl();
  renderMeetingList();

  try {
    state.detailError = "";
    const payload = await fetchJson("/meetings/" + encodeURIComponent(id));
    state.selectedMeetingBundle = payload;
    state.selectedMeeting = payload.meeting || null;
    renderMeetingDetail();
  } catch (error) {
    state.selectedMeeting = null;
    state.selectedMeetingBundle = null;
    state.detailError = error instanceof Error ? error.message : String(error);
    renderMeetingDetail();
  }
}

async function quickOpenMeeting() {
  const query = els.quickOpen.value.trim();
  if (!query) {
    setStatus("Enter a title or id", "error");
    return;
  }

  setStatus("Opening meeting…", "busy");

  try {
    state.quickOpen = query;
    const payload = await fetchJson("/meetings/resolve?q=" + encodeURIComponent(query));
    state.selectedFolderId = payload.meeting?.meeting?.folders?.[0]?.id || null;
    state.search = "";
    state.updatedFrom = "";
    state.updatedTo = "";
    syncFilterInputs();
    renderFolderList();
    await loadMeetings({
      preferredMeetingId: payload.document.id,
    });
    setStatus("Connected", "ok");
  } catch (error) {
    state.detailError = error instanceof Error ? error.message : String(error);
    renderMeetingDetail();
    setStatus("Quick open failed", "error");
  }
}

async function refreshAll(forceLiveMeetings = false) {
  setStatus(forceLiveMeetings ? "Syncing…" : "Refreshing…", "busy");
  try {
    if (forceLiveMeetings) {
      await fetchJson("/sync", {
        body: JSON.stringify({ forceRefresh: true }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
    }

    await loadFolders({ refresh: forceLiveMeetings });
    const [appState, authState] = await Promise.all([fetchJson("/state"), fetchJson("/auth/status")]);
    await loadMeetings({ refresh: forceLiveMeetings });
    state.serverLocked = false;
    state.appState = {
      ...appState,
      auth: authState,
    };
    renderAppState();
    setStatus(
      forceLiveMeetings
        ? "Sync complete"
        : state.meetingSource === "index"
          ? "Loaded from index"
          : "Connected",
      "ok",
    );
  } catch (error) {
    if (error.authRequired) {
      setStatus("Server locked", "error");
      renderSecurityPanel();
      return;
    }

    throw error;
  }
}

async function syncAuthState() {
  const [appState, authState] = await Promise.all([fetchJson("/state"), fetchJson("/auth/status")]);
  state.appState = {
    ...appState,
    auth: authState,
  };
  renderAppState();
}

async function exportNotes() {
  setStatus(state.selectedFolderId ? "Exporting folder notes…" : "Exporting notes…", "busy");
  await fetchJson("/exports/notes", {
    body: JSON.stringify(buildNotesExportRequest(state.selectedFolderId)),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  await refreshAll();
}

async function exportTranscripts() {
  setStatus(
    state.selectedFolderId ? "Exporting folder transcripts…" : "Exporting transcripts…",
    "busy",
  );
  await fetchJson("/exports/transcripts", {
    body: JSON.stringify(buildTranscriptsExportRequest(state.selectedFolderId)),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  await refreshAll();
}

async function rerunJob(id) {
  setStatus("Rerunning export…", "busy");
  try {
    await fetchJson("/exports/jobs/" + encodeURIComponent(id) + "/rerun", {
      method: "POST",
    });
    await refreshAll();
  } catch (error) {
    setStatus("Rerun failed", "error");
    state.detailError = error instanceof Error ? error.message : String(error);
    renderMeetingDetail();
  }
}

async function loginAuth() {
  setStatus("Importing desktop session…", "busy");
  try {
    await fetchJson("/auth/login", { method: "POST" });
    await refreshAll();
  } catch (error) {
    await syncAuthState();
    setStatus("Auth import failed", "error");
    state.detailError = error instanceof Error ? error.message : String(error);
    renderMeetingDetail();
  }
}

async function logoutAuth() {
  setStatus("Signing out…", "busy");
  try {
    await fetchJson("/auth/logout", { method: "POST" });
    await refreshAll();
  } catch (error) {
    await syncAuthState();
    setStatus("Sign out failed", "error");
    state.detailError = error instanceof Error ? error.message : String(error);
    renderMeetingDetail();
  }
}

async function refreshAuth() {
  setStatus("Refreshing session…", "busy");
  try {
    await fetchJson("/auth/refresh", { method: "POST" });
    await refreshAll();
  } catch (error) {
    await syncAuthState();
    setStatus("Refresh failed", "error");
    state.detailError = error instanceof Error ? error.message : String(error);
    renderMeetingDetail();
  }
}

async function switchAuthMode(mode) {
  setStatus("Switching auth source…", "busy");
  try {
    await fetchJson("/auth/mode", {
      body: JSON.stringify({ mode }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    await refreshAll();
  } catch (error) {
    await syncAuthState();
    setStatus("Switch failed", "error");
    state.detailError = error instanceof Error ? error.message : String(error);
    renderMeetingDetail();
  }
}

async function unlockServer() {
  const password = els.serverPassword.value;
  if (!password.trim()) {
    setStatus("Enter the server password", "error");
    return;
  }

  setStatus("Unlocking server…", "busy");
  try {
    await fetchJson("/auth/unlock", {
      body: JSON.stringify({ password }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    els.serverPassword.value = "";
    state.serverLocked = false;
    await refreshAll(true);
  } catch (error) {
    setStatus("Unlock failed", "error");
    state.detailError = error instanceof Error ? error.message : String(error);
    renderMeetingDetail();
  }
}

async function lockServer() {
  try {
    await fetchJson("/auth/lock", {
      method: "POST",
    });
  } catch {}

  state.serverLocked = true;
  state.appState = null;
  state.folders = [];
  state.meetings = [];
  state.selectedFolderId = null;
  state.selectedMeeting = null;
  state.selectedMeetingBundle = null;
  state.detailError = "";
  state.folderError = "";
  els.serverPassword.value = "";
  renderSecurityPanel();
  renderFolderList();
  renderMeetingList();
  renderMeetingDetail();
  setStatus("Server locked", "error");
}

els.folderList.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) {
    return;
  }

  const button = event.target.closest("[data-folder-id]");
  if (!button) {
    return;
  }

  const nextFolderId = button.dataset.folderId || null;
  state.selectedFolderId = nextFolderId;
  state.selectedMeetingId = null;
  state.selectedMeeting = null;
  state.selectedMeetingBundle = null;
  renderFolderList();
  void loadMeetings();
});

els.list.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) {
    return;
  }

  const button = event.target.closest("[data-meeting-id]");
  if (!button) return;
  void loadMeeting(button.dataset.meetingId);
});

els.jobsList.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) {
    return;
  }

  const button = event.target.closest("[data-rerun-job-id]");
  if (!button) {
    return;
  }

  void rerunJob(button.dataset.rerunJobId);
});

els.authPanel.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) {
    return;
  }

  const actionButton = event.target.closest("[data-auth-action]");
  if (actionButton) {
    switch (actionButton.dataset.authAction) {
      case "login":
        void loginAuth();
        return;
      case "logout":
        void logoutAuth();
        return;
      case "refresh":
        void refreshAuth();
        return;
      default:
        return;
    }
  }

  const modeButton = event.target.closest("[data-auth-mode]");
  if (!modeButton) {
    return;
  }

  void switchAuthMode(modeButton.dataset.authMode);
});

els.unlockServerButton.addEventListener("click", () => {
  void unlockServer();
});

els.lockServerButton.addEventListener("click", () => {
  void lockServer();
});

els.serverPassword.addEventListener("keydown", (event) => {
  if (!(event.target instanceof HTMLInputElement)) {
    return;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    void unlockServer();
  }
});

els.refreshButton.addEventListener("click", () => {
  void refreshAll(true);
});

els.noteButton.addEventListener("click", () => {
  void exportNotes();
});

els.transcriptButton.addEventListener("click", () => {
  void exportTranscripts();
});

els.search.addEventListener("input", (event) => {
  if (!(event.target instanceof HTMLInputElement)) {
    return;
  }

  state.search = event.target.value.trim();
  void loadMeetings();
});

els.sort.addEventListener("change", (event) => {
  if (!(event.target instanceof HTMLSelectElement)) {
    return;
  }

  state.sort = event.target.value;
  void loadMeetings();
});

els.updatedFrom.addEventListener("change", (event) => {
  if (!(event.target instanceof HTMLInputElement)) {
    return;
  }

  state.updatedFrom = event.target.value;
  void loadMeetings();
});

els.updatedTo.addEventListener("change", (event) => {
  if (!(event.target instanceof HTMLInputElement)) {
    return;
  }

  state.updatedTo = event.target.value;
  void loadMeetings();
});

els.quickOpen.addEventListener("input", (event) => {
  if (!(event.target instanceof HTMLInputElement)) {
    return;
  }

  state.quickOpen = event.target.value;
});

els.quickOpen.addEventListener("keydown", (event) => {
  if (!(event.target instanceof HTMLInputElement)) {
    return;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    void quickOpenMeeting();
  }
});

els.quickOpenButton.addEventListener("click", () => {
  void quickOpenMeeting();
});

els.workspaceTabs.forEach((button) => {
  button.addEventListener("click", () => {
    state.workspaceTab = button.dataset.workspaceTab || "notes";
    syncBrowserUrl();
    renderMeetingDetail();
  });
});

document.addEventListener("keydown", (event) => {
  if (
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLSelectElement ||
    event.target instanceof HTMLTextAreaElement
  ) {
    return;
  }

  const nextTab = nextWorkspaceTab(state.workspaceTab, event.key);
  if (nextTab) {
    state.workspaceTab = nextTab;
    syncBrowserUrl();
    renderMeetingDetail();
  }
});

const initialSelection = startupSelectionFromSearch(window.location.search);
state.selectedFolderId = initialSelection.folderId || null;
state.selectedMeetingId = initialSelection.meetingId || null;
state.workspaceTab = initialSelection.workspaceTab;

const events = new EventSource("/events");
events.addEventListener("state.updated", (event) => {
  const previousLoadedAt = state.appState?.documents?.loadedAt;
  const payload = JSON.parse(event.data);
  state.appState = payload.state;
  renderAppState();

  if (
    state.meetingSource === "index" &&
    payload.state.documents?.loadedAt &&
    payload.state.documents.loadedAt !== previousLoadedAt
  ) {
    void (async () => {
      await loadFolders();
      await loadMeetings({
        preferredMeetingId: state.selectedMeetingId,
      });
    })();
  }
});
events.addEventListener("error", () => {
  setStatus("Disconnected", "error");
});

syncFilterInputs();
renderSecurityPanel();
renderFolderList();

void refreshAll().catch((error) => {
  setStatus("Error", "error");
  els.empty.hidden = false;
  els.empty.textContent = error.message;
});
`;
