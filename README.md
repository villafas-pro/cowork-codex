# Cowork Codex

A personal desktop workspace for developers — notes, code snippets, flow diagrams, and work item tracking, all in one place.

Built with Electron + React + TypeScript.

---

## Features

- **Notes** — Rich text editor (TipTap) with formatting, task lists, images, and `[[wiki-style]]` note linking. Optional AES-256-GCM password lock per note. Version history with restore (last 15 snapshots, content-diffed).
- **Code** — Monaco-powered code editor with syntax highlighting for 50+ languages.
- **Flow** — Visual node-based diagrams via ReactFlow.
- **Work Items** — Link notes to Azure DevOps work items. Background sync keeps state current. "Still Active" home panel surfaces notes with unresolved items.
- **Images** — Local image library stored in the app database.
- **Appearance** — Dark / light theme toggle, three editor font sizes, all persisted across sessions.

---

## Tech Stack

| Layer | Library |
|---|---|
| Shell | Electron 29 |
| Build | electron-vite, Vite 5 |
| UI | React 18 + TypeScript |
| Styling | Tailwind CSS 3 (CSS-variable theming) |
| Rich text | TipTap 2 |
| Code editor | Monaco Editor |
| Diagrams | ReactFlow 11 |
| Database | better-sqlite3 (SQLite, main process) |
| State | Zustand |

---

## Development

```bash
npm install
npm run dev
```

Requires Node 20+. The app uses a native module (`better-sqlite3`) — on Windows, ensure you have the Visual C++ build tools installed (via the `windows-build-tools` npm package or Visual Studio).

---

## Building

**Windows installer (.exe):**

```bash
npm run build:win
```

Output lands in `dist/`. The installer is an NSIS one-click setup with optional install directory selection.

**CI/CD:** Every push to `main` triggers a GitHub Actions workflow (`windows-latest`) that builds and uploads the `.exe` as a build artifact (retained 90 days).

---

## Project Structure

```
src/
  main/           # Electron main process
    ipc/          # IPC handlers (notes, code, flow, ADO, settings…)
  preload/        # Context bridge (exposes window.api)
  renderer/
    src/
      components/ # Shared UI components, editors
      pages/      # Full-page views (Home, Settings, Images…)
      store/      # Zustand stores
      lib/        # Utilities (workItemUtils, etc.)
resources/        # App icons
```

---

## License

Private — all rights reserved.
