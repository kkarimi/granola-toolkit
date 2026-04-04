export const granolaWebMarkup = String.raw`
<div class="shell">
  <aside class="pane sidebar">
    <section class="hero">
      <h1>Granola Toolkit</h1>
      <p>Browser workspace for folders, meetings, notes, transcripts, and export flows on top of one local server instance.</p>
      <input class="search" data-search placeholder="Search meetings, ids, or tags" />
      <div class="field-row field-row--inline">
        <label>
          <span class="field-label">Sort</span>
          <select class="select" data-sort>
            <option value="updated-desc">Newest first</option>
            <option value="updated-asc">Oldest first</option>
            <option value="title-asc">Title A-Z</option>
            <option value="title-desc">Title Z-A</option>
          </select>
        </label>
        <label>
          <span class="field-label">Updated From</span>
          <input class="field-input" data-updated-from type="date" />
        </label>
      </div>
      <label class="field-row">
        <span class="field-label">Updated To</span>
        <input class="field-input" data-updated-to type="date" />
      </label>
    </section>
    <section class="folder-panel">
      <div class="folder-panel__head">
        <h2>Folders</h2>
        <p>Pick a folder to scope the meeting browser, or stay on All meetings.</p>
      </div>
      <div class="folder-list" data-folder-list></div>
    </section>
    <section class="toolbar">
      <div>
        <p>Meetings are loaded from the shared server state so this view can later coexist with the terminal UI.</p>
      </div>
      <div class="toolbar-form">
        <input class="field-input" data-quick-open placeholder="Quick open by id or title" />
        <button class="button button--secondary" data-quick-open-button>Open</button>
      </div>
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
        <button class="button button--primary" data-refresh>Sync now</button>
        <button class="button button--secondary" data-export-notes>Export Notes</button>
        <button class="button button--secondary" data-export-transcripts>Export Transcripts</button>
      </div>
      <p>Initial beta web client. It speaks to the same local API that future TUI and attach flows will use.</p>
    </section>
    <section class="security-panel" data-security-panel hidden>
      <div class="security-panel__head">
        <h3>Server Access</h3>
        <p>This server is locked with a password. Unlock it to load meetings and live state.</p>
      </div>
      <div class="security-panel__body">
        <input class="field-input" data-server-password type="password" placeholder="Server password" />
        <div class="toolbar-actions">
          <button class="button button--primary" data-unlock-server>Unlock</button>
          <button class="button button--secondary" data-lock-server>Lock</button>
        </div>
      </div>
    </section>
    <section class="auth-panel">
      <div class="auth-panel__head">
        <h3>Auth Session</h3>
        <p>Inspect, refresh, and switch between stored session and <code>supabase.json</code>.</p>
      </div>
      <div class="auth-panel__body" data-auth-panel></div>
    </section>
    <section class="jobs-panel">
      <div class="jobs-panel__head">
        <h3>Recent Export Jobs</h3>
        <p>Tracked across CLI and web runs.</p>
      </div>
      <div class="jobs-list" data-jobs-list></div>
    </section>
    <nav class="workspace-tabs">
      <button class="workspace-tab" data-workspace-tab="notes">Notes</button>
      <button class="workspace-tab" data-workspace-tab="transcript">Transcript</button>
      <button class="workspace-tab" data-workspace-tab="metadata">Metadata</button>
      <button class="workspace-tab" data-workspace-tab="raw">Raw</button>
      <span class="workspace-hint">1-4 switch tabs, [ and ] cycle</span>
    </nav>
    <div class="detail-meta" data-detail-meta></div>
    <div class="detail-body" data-detail-body>
      <div class="empty" data-empty>Select a meeting to inspect its notes and transcript.</div>
    </div>
  </main>
</div>
`;
