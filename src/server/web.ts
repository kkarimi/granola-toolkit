export function renderGranolaWebPage(): string {
  const appScript = String.raw`
const state = {
  meetings: [],
  selectedMeetingId: null,
  selectedMeeting: null,
  appState: null,
  search: "",
};

const els = {
  appState: document.querySelector("[data-app-state]"),
  detailBody: document.querySelector("[data-detail-body]"),
  detailMeta: document.querySelector("[data-detail-meta]"),
  empty: document.querySelector("[data-empty]"),
  list: document.querySelector("[data-meeting-list]"),
  noteButton: document.querySelector("[data-export-notes]"),
  refreshButton: document.querySelector("[data-refresh]"),
  search: document.querySelector("[data-search]"),
  stateBadge: document.querySelector("[data-state-badge]"),
  transcriptButton: document.querySelector("[data-export-transcripts]"),
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
  if (state.meetings.length === 0) {
    state.selectedMeetingId = null;
    state.selectedMeeting = null;
    els.list.innerHTML = '<div class="meeting-empty">No meetings yet. Try Refresh.</div>';
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
  const record = state.selectedMeeting;
  if (!record) {
    els.empty.hidden = false;
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

  els.detailBody.innerHTML = [
    '<section class="detail-section">',
    "<h2>Notes</h2>",
    '<pre class="detail-pre">' + escapeHtml(record.noteMarkdown || "") + "</pre>",
    "</section>",
    '<section class="detail-section">',
    "<h2>Transcript</h2>",
    '<pre class="detail-pre">' + escapeHtml(record.transcriptText || "(Transcript unavailable)") + "</pre>",
    "</section>",
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

async function loadMeetings() {
  const query = state.search ? "?search=" + encodeURIComponent(state.search) + "&limit=50" : "?limit=50";
  const payload = await fetchJson("/meetings" + query);
  state.meetings = payload.meetings || [];
  if (!state.selectedMeetingId && state.meetings[0]) {
    state.selectedMeetingId = state.meetings[0].id;
  }
  renderMeetingList();
  if (state.selectedMeetingId) {
    await loadMeeting(state.selectedMeetingId);
  } else {
    renderMeetingDetail();
  }
}

async function loadMeeting(id) {
  state.selectedMeetingId = id;
  renderMeetingList();
  const payload = await fetchJson("/meetings/" + encodeURIComponent(id));
  state.selectedMeeting = payload.meeting || null;
  renderMeetingDetail();
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

const events = new EventSource("/events");
events.addEventListener("state.updated", (event) => {
  const payload = JSON.parse(event.data);
  state.appState = payload.state;
  renderAppState();
});
events.addEventListener("error", () => {
  setStatus("Disconnected", "error");
});

void refreshAll().catch((error) => {
  setStatus("Error", "error");
  els.empty.hidden = false;
  els.empty.textContent = error.message;
});
`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Granola Toolkit</title>
    <style>
      :root {
        --bg: #f2ede2;
        --panel: rgba(255, 252, 247, 0.86);
        --panel-strong: #fffaf2;
        --line: rgba(36, 39, 44, 0.12);
        --ink: #1d242c;
        --muted: #5d6b77;
        --accent: #0d6a6d;
        --accent-soft: rgba(13, 106, 109, 0.12);
        --warm: #a34f2f;
        --ok: #246b4f;
        --error: #9d2c2c;
        --shadow: 0 24px 80px rgba(40, 32, 16, 0.12);
        --radius: 24px;
        --mono: "SF Mono", "IBM Plex Mono", "Cascadia Code", monospace;
        --serif: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif;
        --sans: "Avenir Next", "Segoe UI", sans-serif;
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        min-height: 100vh;
        font-family: var(--sans);
        color: var(--ink);
        background:
          radial-gradient(circle at top left, rgba(163, 79, 47, 0.18), transparent 32%),
          radial-gradient(circle at right 12%, rgba(13, 106, 109, 0.16), transparent 28%),
          linear-gradient(180deg, #f8f2e8 0%, var(--bg) 100%);
      }

      .shell {
        display: grid;
        grid-template-columns: 320px minmax(0, 1fr);
        gap: 18px;
        min-height: 100vh;
        padding: 24px;
      }

      .pane {
        background: var(--panel);
        backdrop-filter: blur(18px);
        border: 1px solid var(--line);
        border-radius: var(--radius);
        box-shadow: var(--shadow);
      }

      .sidebar {
        display: grid;
        grid-template-rows: auto auto 1fr;
        overflow: hidden;
      }

      .hero, .toolbar, .detail-head {
        padding: 22px 24px;
        border-bottom: 1px solid var(--line);
      }

      .hero h1 {
        margin: 0;
        font-family: var(--serif);
        font-size: clamp(2rem, 3vw, 2.8rem);
        font-weight: 600;
        letter-spacing: -0.04em;
      }

      .hero p, .toolbar p {
        margin: 8px 0 0;
        color: var(--muted);
        line-height: 1.5;
      }

      .search {
        width: 100%;
        margin-top: 16px;
        padding: 12px 14px;
        border: 1px solid var(--line);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.7);
        color: var(--ink);
        font: inherit;
      }

      .meeting-list {
        padding: 14px;
        overflow: auto;
      }

      .meeting-row {
        width: 100%;
        display: grid;
        gap: 4px;
        text-align: left;
        margin: 0 0 10px;
        padding: 14px 16px;
        border: 1px solid transparent;
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.72);
        color: inherit;
        cursor: pointer;
        transition: transform 140ms ease, border-color 140ms ease, background 140ms ease;
      }

      .meeting-row:hover,
      .meeting-row[data-selected="true"] {
        transform: translateY(-1px);
        border-color: rgba(13, 106, 109, 0.25);
        background: var(--panel-strong);
      }

      .meeting-row__title {
        font-weight: 600;
      }

      .meeting-row__meta {
        color: var(--muted);
        font-size: 0.92rem;
      }

      .meeting-empty {
        padding: 18px;
        color: var(--muted);
      }

      .detail {
        display: grid;
        grid-template-rows: auto auto 1fr;
        min-width: 0;
      }

      .detail-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 18px;
      }

      .detail-head h2 {
        margin: 0;
        font-family: var(--serif);
        font-size: clamp(1.8rem, 2.4vw, 2.4rem);
        font-weight: 600;
      }

      .state-badge {
        padding: 10px 14px;
        border-radius: 999px;
        background: var(--accent-soft);
        color: var(--accent);
        font-size: 0.92rem;
        font-weight: 700;
      }

      .state-badge[data-tone="busy"] { color: var(--warm); background: rgba(163, 79, 47, 0.12); }
      .state-badge[data-tone="error"] { color: var(--error); background: rgba(157, 44, 44, 0.12); }
      .state-badge[data-tone="ok"] { color: var(--ok); background: rgba(36, 107, 79, 0.12); }

      .toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
      }

      .toolbar-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }

      .button {
        border: 0;
        border-radius: 999px;
        padding: 12px 16px;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }

      .button--primary {
        background: var(--ink);
        color: white;
      }

      .button--secondary {
        background: rgba(255, 255, 255, 0.72);
        color: var(--ink);
        border: 1px solid var(--line);
      }

      .status-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 14px;
      }

      .status-label {
        display: block;
        margin-bottom: 6px;
        color: var(--muted);
        font-size: 0.78rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .detail-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        padding: 0 24px 18px;
      }

      .detail-chip {
        padding: 10px 12px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.72);
        border: 1px solid var(--line);
        color: var(--muted);
        font-size: 0.88rem;
      }

      .detail-body {
        padding: 0 24px 24px;
        overflow: auto;
      }

      .detail-section {
        margin-bottom: 20px;
        padding: 20px;
        background: rgba(255, 255, 255, 0.72);
        border: 1px solid var(--line);
        border-radius: 20px;
      }

      .detail-section h2 {
        margin: 0 0 14px;
        font-size: 1rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .detail-pre {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
        font-family: var(--mono);
        line-height: 1.55;
      }

      .empty {
        margin: 24px;
        padding: 24px;
        border-radius: 20px;
        background: rgba(255, 255, 255, 0.72);
        border: 1px dashed rgba(36, 39, 44, 0.2);
        color: var(--muted);
      }

      @media (max-width: 900px) {
        .shell {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <aside class="pane sidebar">
        <section class="hero">
          <h1>Granola Toolkit</h1>
          <p>Browser workspace for meetings, notes, transcripts, and export flows on top of one local server instance.</p>
          <input class="search" data-search placeholder="Search meetings, ids, or tags" />
        </section>
        <section class="toolbar">
          <p>Meetings are loaded from the shared server state so this view can later coexist with the terminal UI.</p>
        </section>
        <section class="meeting-list" data-meeting-list></section>
      </aside>
      <main class="pane detail">
        <section class="detail-head">
          <div>
            <h2>Meeting Workspace</h2>
            <div data-app-state></div>
          </div>
          <div class="state-badge" data-state-badge data-tone="idle">Connecting…</div>
        </section>
        <section class="toolbar">
          <div class="toolbar-actions">
            <button class="button button--primary" data-refresh>Refresh</button>
            <button class="button button--secondary" data-export-notes>Export Notes</button>
            <button class="button button--secondary" data-export-transcripts>Export Transcripts</button>
          </div>
          <p>Initial beta web client. It speaks to the same local API that future TUI and attach flows will use.</p>
        </section>
        <div class="detail-meta" data-detail-meta></div>
        <div class="detail-body" data-detail-body>
          <div class="empty" data-empty>Select a meeting to inspect its notes and transcript.</div>
        </div>
      </main>
    </div>
    <script type="module">
${appScript}
    </script>
  </body>
</html>`;
}
