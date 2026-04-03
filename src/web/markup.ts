export const granolaWebMarkup = String.raw`
<div class="shell">
  <aside class="pane sidebar">
    <section class="hero">
      <h1>Granola Toolkit</h1>
      <p>Browser workspace for meetings, notes, transcripts, and export flows on top of one local server instance.</p>
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
        <button class="button button--primary" data-refresh>Refresh</button>
        <button class="button button--secondary" data-export-notes>Export Notes</button>
        <button class="button button--secondary" data-export-transcripts>Export Transcripts</button>
      </div>
      <p>Initial beta web client. It speaks to the same local API that future TUI and attach flows will use.</p>
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
