export const granolaWebStyles = String.raw`
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

.search,
.select,
.field-input {
  width: 100%;
  margin-top: 16px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.7);
  color: var(--ink);
  font: inherit;
}

.field-row {
  display: grid;
  gap: 10px;
  margin-top: 12px;
}

.field-row--inline {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.field-label {
  display: block;
  margin-bottom: 6px;
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
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

.meeting-empty--error {
  color: var(--error);
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

.toolbar-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  width: min(440px, 100%);
}

.workspace-tabs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 0 24px 18px;
}

.workspace-tab {
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.72);
  color: var(--muted);
  cursor: pointer;
  font: inherit;
  font-weight: 700;
}

.workspace-tab[data-selected="true"] {
  background: var(--ink);
  color: white;
  border-color: var(--ink);
}

.workspace-hint {
  color: var(--muted);
  font-size: 0.86rem;
  margin-left: auto;
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

.workspace-grid {
  display: grid;
  grid-template-columns: minmax(240px, 320px) minmax(0, 1fr);
  gap: 18px;
}

.workspace-sidebar,
.workspace-main {
  margin-bottom: 0;
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

  .field-row--inline,
  .toolbar-form,
  .workspace-grid {
    grid-template-columns: 1fr;
  }

  .workspace-hint {
    margin-left: 0;
  }
}
`;
