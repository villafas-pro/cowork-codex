# Cowork Codex — Session Handoff

## What This Project Is
**Cowork Codex** is a personal productivity desktop app built with Electron + React + TypeScript. Think Notion-lite: notes with a rich text editor, embedded code blocks, embedded flow diagrams, linked work items (Azure DevOps), and a full tab system.

**Repo:** `https://github.com/villafas-pro/cowork-codex`  
**Stack:** Electron + electron-vite, React, TypeScript, TipTap (rich text), ReactFlow (diagrams), Monaco Editor (code), Zustand (state), better-sqlite3 (local DB), Tailwind CSS

---

## Project Structure
```
src/
  main/         ← Electron main process
    ipc/        ← IPC handlers (notes.ts, codeBlocks.ts, flows.ts, ado.ts, etc.)
    db.ts       ← SQLite schema + migrations
  preload/
    index.ts    ← contextBridge — exposes window.api to renderer
  renderer/src/
    App.tsx         ← Root: tab router, key-based editor mounting
    store/
      appStore.ts   ← Zustand store (tabs, viewMode, activeTabId, etc.)
    pages/          ← Home, Notes, Code, Flow, WorkItems, Images, Settings
    components/
      layout/       ← Sidebar, TitleBar, GlobalSearch
      editors/
        NoteEditor.tsx     ← Main rich text editor
        CodeEditor.tsx     ← Monaco code editor with tabs
        FlowEditor.tsx     ← ReactFlow diagram editor
        WorkItemViewer.tsx ← ADO work item viewer
        embeds/            ← CodeEmbedView, FlowEmbedView (inline in notes)
        extensions/        ← TipTap custom extensions (CodeEmbed, FlowEmbed, NoteLink)
      WorkItemSearch.tsx   ← ADO search with filters
      WorkItemRow.tsx      ← Shared work item row component
```

---

## How the Tab System Works
- All open items live in `tabs[]` in Zustand with `{ id, entityType, entityId, title }`
- `activeTabId` determines what's shown
- **Critical:** `App.tsx` uses `key={activeTab.entityId}` on all editors to force full unmount/remount when switching between different entities. This prevents React from reusing component instances.
- `viewMode` is either `'tab'` (showing an editor) or `'section'` (showing a list page)

---

## The IPC Pattern
Main process handlers in `src/main/ipc/`. Preload exposes them via `window.api`. Types declared in `App.tsx`.

Key namespaces on `window.api`:
- `notes` — CRUD, togglePin, toggleLock, password (set/remove/unlock), versions, search, images
- `code` — CRUD, togglePin, syncBlocks, import, linkNote, unlinkNote, getForNote
- `flows` — CRUD, togglePin, linkNote, unlinkNote, getForNote
- `workItems` — CRUD, link/unlink to entities, toggleDone, getForEntity, findByItemNumber
- `integrations` — work item providers (Azure DevOps and Jira): getConnections, saveConnection, deleteConnection, testConnection, isConfigured, checkAll, search, fetchItem, syncLinked, parseRef. Code lives in `src/main/integrations/` (one provider file per system behind a shared `Provider` interface). Tokens are encrypted with Electron `safeStorage` and never reach the renderer.
- `tags` — getAll, create, update, delete, merge, getAssignments, assign, unassign, getItems (tags apply to notes, code blocks and flows, not work items)
- `archive` — set, archiveCompletedNotes (`archived_at` column on notes, code_blocks, flows; archived items are hidden from lists, Home and global search by default)
- `tabs` — getAll, save
- `settings` — get, set
- `templates` — getAll, create, delete
- `todo` — get, save
- `search` — global

---

## What Was Built (Complete Features)
- ✅ Rich text note editor (TipTap) with bold/italic/headings/lists/blockquote/task lists/underline/strikethrough
- ✅ Inline code block embeds in notes (Monaco editor inside TipTap)
- ✅ Inline flow diagram embeds in notes (ReactFlow inside TipTap)
- ✅ Drag-to-reorder embeds via grip handle
- ✅ "In This Note" side panel showing linked code/flows with remove/unlink/delete-globally
- ✅ Full tab system with persistence (SQLite) + restore on app restart
- ✅ Note locking (read-only toggle)
- ✅ Note password protection (AES-256-GCM encryption, session password cache)
- ✅ Note version history (snapshots every 5 min when content changes)
- ✅ Global search (Ctrl+T) across notes, code, flows
- ✅ Azure DevOps work item integration — search, link to notes/code/flows, sync cached state
- ✅ Work item viewer tab (shows ADO HTML description + metadata)
- ✅ Images gallery page (extracts all base64 images from notes)
- ✅ Dark/light theme toggle
- ✅ Editor font size setting (small/medium/large)
- ✅ Back/forward navigation history
- ✅ Pinned notes
- ✅ Code blocks: language picker, copy, sync blocks, import from note
- ✅ Tags (filter bar, `#tag` search, per-item picker, Tags page with rename/recolor/merge/delete) and archive/restore on notes, code and flows
- ✅ Month headings in the Notes, Code and Flow lists
- ✅ List rows have one "..." menu (`RowMenu`: tags, pin, lock, archive, delete); pin/lock/password show as small icons only when active. Popovers (`Popover.tsx`) use a portal plus full-screen backdrop so dismissing never clicks through to the row beneath.
- ✅ Multiselect on Notes/Code/Flow (`lib/selection.ts`, `BulkBar.tsx`): checkbox, Ctrl/Cmd+click, Shift+click range, Esc clears; bulk tag (all/some/none check marks), archive/restore, delete (locked notes skipped)
- ✅ Jira Cloud integration alongside Azure DevOps. Work items store `provider` (ado/jira/manual) and `container` (project); item numbers are ADO "123" or Jira "OB-123". "Done" uses a provider-neutral `state_category`. Work Items page can group/filter by project.

- ✅ Pipeline dashboard (Claude, Jira, Rivet, GitHub). Stage is automatic, category is yours. Stage logic lives in `src/shared/pipeline.ts` (pure, property-tested with vitest + fast-check: `npm test`). Evidence: Rivet's Jira comments (`src/main/pipeline/rivet.ts`), GitHub PR state (`github.ts`, token stored encrypted in settings), and Claude Code session events. Tables: `pipeline_categories`, `pipeline_items`, `pipeline_events`. Background refresh every 3 min plus on demand; desktop alerts for PR ready / review / merged / PR closed / stale (muted categories stay quiet).
- ✅ Claude Code hook: Settings > Pipeline installs four hooks into `~/.claude/settings.json` (backup first, existing hooks kept). The hook script (`hookScript.ts`) drops small JSON files in `<userData>/pipeline-events`; the app ingests and deletes them. "Open session" runs `claude --desktop --resume <id>` and is untested for sessions started in the Desktop Code tab.

## Notes on work items
- `work_items.provider = 'manual'` means a plain link the user ticks off themselves.
- ADO PATs used to live in `settings` (plain text). On first launch they migrate into the `connections` table, encrypted. Older database backups still contain the plain-text token.
- Encrypted tokens only decrypt for the same Windows user on the same PC. If the OneDrive database is opened elsewhere, Settings shows a "re-enter token" warning.
- Jira search uses `POST /rest/api/3/search/jql`. Verify against Atlassian's docs if Jira search ever returns errors.
---

## Recent Fixes (This Session)
Two bugs were fixed and committed:

### 1. `noteLoadedRef` guard (commit `79f3797`)
**Problem:** TipTap can fire `onUpdate` with an empty document during/after editor initialisation, before the async `loadNote()` IPC call returns. This queued a 500ms debounced save that fired *after* `setContent(realContent, false)` loaded the real content — overwriting it with an empty doc. Password notes were hit harder because the session-password map in the main process persists across renderer remounts.

**Fix:** `noteLoadedRef` boolean — starts `false` on every `noteId` change, set to `true` only when `loadNote()` finishes. The `onUpdate` handler returns early until lifted.

### 2. Spurious version history entries (commit `8527f29`)
**Problem:** Version snapshots were being created even when content hadn't changed, and empty content could be snapshotted.

**Fix:**
- `notes:update` for plain notes now short-circuits if incoming title+content match what's already in DB
- `_saveVersion` guards against snapshotting empty/`'{}'` content

---

## Pending Tasks (What's Left)

### High priority
- **#17** — Fix stale "Linked items" side panel after adding a work item (the panel doesn't update immediately after adding an item from WorkItemSearch in the note side panel). Needs `loadWorkItems()` called after `onAdd` callback fires.
- **#33** — Build note version history UI (the `notes:getVersions` IPC exists and returns data; the modal skeleton exists in NoteEditor with a History button — it just needs the full UI connecting to the existing IPC)

### Recently completed
- **#32** — Editor font size setting UI ✅ (Small/Medium/Large buttons in Settings.tsx Appearance section)
- **Home dashboard redesign** ✅ — Two-column layout: left has "Recently Opened" (notes + code + flows, merged by updated_at, top 10) and "My Work Items" (local linked items + ADO-assigned items merged in background, deduplicated by item_number, capped at 10, link icon on locally-linked items). Right column is sticky Quick Scratch Pad.

---

## Key Code Patterns to Know

### scheduleSave in NoteEditor
```tsx
const scheduleSave = useCallback((currentTitle: string, content: any) => {
  if (saveTimer.current) clearTimeout(saveTimer.current)
  saveTimer.current = setTimeout(async () => {
    await window.api?.notes.update(noteId, {
      title: currentTitle,
      content: JSON.stringify(content)
    })
  }, 500)
}, [noteId])
```
Always debounced 500ms. Called from `onUpdate` (guarded by `noteLoadedRef`) and `handleTitleChange`.

### noteLoadedRef guard
```tsx
const noteLoadedRef = useRef(false)
// Reset in [noteId] effect, set to true at end of loadNote()
onUpdate: ({ editor }) => {
  if (!noteLoadedRef.current) return
  scheduleSave(titleRef.current, editor.getJSON())
}
```

### Tab key forcing remount (App.tsx)
```tsx
return <NoteEditor key={activeTab.entityId} noteId={activeTab.entityId} />
```
This is intentional and critical — do not remove. It prevents React from reusing editor instances across tab switches.

### Embed sync in NoteEditor
Uses `editor.on('update', handleUpdate)` (separate from `onUpdate`) to detect when embedded code/flow blocks are deleted from the doc and auto-unlink them. Uses `unlinkingRef` to avoid double-unlink when the X button triggers an explicit unlink.

---

## Running the App
```bash
cd cowork-codex
npm install
npm run dev       # dev mode with hot reload
npm run build     # production build
```

## Pushing Changes
The remote is `https://github.com/villafas-pro/cowork-codex.git`. Sebastian handles the `git push` manually since the sandbox doesn't have GitHub credentials.
