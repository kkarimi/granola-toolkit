export const granolaWebClientScript = String.raw`
const state = {
  appState: null,
  detailError: "",
  listError: "",
  meetings: [],
  quickOpen: "",
  search: "",
  selectedMeeting: null,
  selectedMeetingBundle: null,
  selectedMeetingId: null,
  sort: "updated-desc",
  updatedFrom: "",
  updatedTo: "",
  workspaceTab: "notes",
};

const els = {
  appState: document.querySelector("[data-app-state]"),
  detailBody: document.querySelector("[data-detail-body]"),
  detailMeta: document.querySelector("[data-detail-meta]"),
  empty: document.querySelector("[data-empty]"),
  list: document.querySelector("[data-meeting-list]"),
  noteButton: document.querySelector("[data-export-notes]"),
  quickOpen: document.querySelector("[data-quick-open]"),
  quickOpenButton: document.querySelector("[data-quick-open-button]"),
  refreshButton: document.querySelector("[data-refresh]"),
  search: document.querySelector("[data-search]"),
  sort: document.querySelector("[data-sort]"),
  stateBadge: document.querySelector("[data-state-badge]"),
  transcriptButton: document.querySelector("[data-export-transcripts]"),
  updatedFrom: document.querySelector("[data-updated-from]"),
  updatedTo: document.querySelector("[data-updated-to]"),
  workspaceTabs: document.querySelectorAll("[data-workspace-tab]"),
};

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

function currentFilterSummary() {
  const parts = [];

  if (state.search) {
    parts.push('search "' + state.search + '"');
  }

  if (state.updatedFrom) {
    parts.push("from " + state.updatedFrom);
  }

  if (state.updatedTo) {
    parts.push("to " + state.updatedTo);
  }

  return parts.join(", ");
}

function renderWorkspaceTabs() {
  for (const button of els.workspaceTabs) {
    button.dataset.selected = button.dataset.workspaceTab === state.workspaceTab ? "true" : "false";
  }
}

function renderAppState() {
  if (!state.appState) {
    els.appState.innerHTML = "<p>Waiting for server state…</p>";
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

  els.appState.innerHTML = [
    '<div class="status-grid">',
    '<div><span class="status-label">Surface</span><strong>' + escapeHtml(appState.ui.surface) + "</strong></div>",
    '<div><span class="status-label">View</span><strong>' + escapeHtml(appState.ui.view) + "</strong></div>",
    '<div><span class="status-label">Auth</span><strong>' + escapeHtml(authMode) + "</strong></div>",
    '<div><span class="status-label">Documents</span><strong>' + escapeHtml(docs) + "</strong></div>",
    '<div><span class="status-label">Cache</span><strong>' + escapeHtml(cache) + "</strong></div>",
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
    const filterSummary = currentFilterSummary();
    const message = filterSummary
      ? "No meetings match " + filterSummary + "."
      : "No meetings yet. Try Refresh.";
    els.list.innerHTML = '<div class="meeting-empty">' + escapeHtml(message) + "</div>";
    renderMeetingDetail();
    return;
  }

  const visibleIds = new Set(state.meetings.map((meeting) => meeting.id));
  if (!state.selectedMeetingId || !visibleIds.has(state.selectedMeetingId)) {
    state.selectedMeetingId = state.meetings[0]?.id || null;
  }

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

async function fetchJson(path, init) {
  const response = await fetch(path, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || response.statusText || "Request failed");
  }
  return payload;
}

function buildMeetingsQuery(limit = 100) {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  params.set("sort", state.sort);

  if (state.search) {
    params.set("search", state.search);
  }

  if (state.updatedFrom) {
    params.set("updatedFrom", state.updatedFrom);
  }

  if (state.updatedTo) {
    params.set("updatedTo", state.updatedTo);
  }

  return "?" + params.toString();
}

async function loadMeetings(options = {}) {
  const preferredMeetingId = options.preferredMeetingId || state.selectedMeetingId;

  try {
    state.listError = "";
    const payload = await fetchJson("/meetings" + buildMeetingsQuery());
    state.meetings = payload.meetings || [];

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
    state.search = "";
    state.updatedFrom = "";
    state.updatedTo = "";
    syncFilterInputs();
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

async function refreshAll() {
  setStatus("Refreshing…", "busy");
  const [appState] = await Promise.all([fetchJson("/state"), loadMeetings()]);
  state.appState = appState;
  renderAppState();
  setStatus("Connected", "ok");
}

async function exportNotes() {
  setStatus("Exporting notes…", "busy");
  await fetchJson("/exports/notes", {
    body: JSON.stringify({ format: "markdown" }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  await refreshAll();
}

async function exportTranscripts() {
  setStatus("Exporting transcripts…", "busy");
  await fetchJson("/exports/transcripts", {
    body: JSON.stringify({ format: "text" }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  await refreshAll();
}

els.list.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) {
    return;
  }

  const button = event.target.closest("[data-meeting-id]");
  if (!button) return;
  void loadMeeting(button.dataset.meetingId);
});

els.refreshButton.addEventListener("click", () => {
  void refreshAll();
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

  const tabs = ["notes", "transcript", "metadata", "raw"];
  if (event.key === "1") {
    state.workspaceTab = "notes";
    renderMeetingDetail();
    return;
  }

  if (event.key === "2") {
    state.workspaceTab = "transcript";
    renderMeetingDetail();
    return;
  }

  if (event.key === "3") {
    state.workspaceTab = "metadata";
    renderMeetingDetail();
    return;
  }

  if (event.key === "4") {
    state.workspaceTab = "raw";
    renderMeetingDetail();
    return;
  }

  const currentIndex = tabs.indexOf(state.workspaceTab);
  if (event.key === "]") {
    state.workspaceTab = tabs[(currentIndex + 1) % tabs.length];
    renderMeetingDetail();
  }

  if (event.key === "[") {
    state.workspaceTab = tabs[(currentIndex + tabs.length - 1) % tabs.length];
    renderMeetingDetail();
  }
});

const events = new EventSource("/events");
events.addEventListener("state.updated", (event) => {
  const payload = JSON.parse(event.data);
  state.appState = payload.state;
  renderAppState();
});
events.addEventListener("error", () => {
  setStatus("Disconnected", "error");
});

syncFilterInputs();

void refreshAll().catch((error) => {
  setStatus("Error", "error");
  els.empty.hidden = false;
  els.empty.textContent = error.message;
});
`;
