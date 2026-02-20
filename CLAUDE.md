# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
# Install dependencies (from root)
npm install

# Run both client and server concurrently
npm run dev

# Run individually
npm run server          # server only (tsx watch, port 3001)
npm run client          # client only (vite, port 5173)

# Build
npm run build           # builds server then client

# Build individually
npm run build -w server # tsc → dist/
npm run build -w client # tsc -b && vite build
```

No test framework is configured yet.

## Architecture

**Monorepo** using npm workspaces with two packages: `server/` and `client/`.

This is a Kanban-style project management app with AI-assisted development (Claude Code integration), real-time collaboration via WebSocket, and Git/GitHub integration.

### Server (`server/`)

Express 5 + better-sqlite3 + WebSocket. Entry: `src/index.ts` → `src/app.ts`.

- **Routes** (`src/routes/`): REST endpoints under `/api/` — cards, repos, settings, chats, files, pr, ide
- **Services** (`src/services/`): Business logic layer — CardService, RepoService, GitService, GitHubService, FileService, SettingsService, ProcessManager
- **Worker system** (`src/worker/`): Forked child processes (one per active card) that run Claude Code sessions and watch branch directories for file changes. ProcessManager supervises lifecycle (max 5 concurrent, crash recovery). Workers communicate via Node IPC → WebSocket bridge to clients.
- **Database**: SQLite at `server/data/kanban.db` (WAL mode, foreign keys). Tables: repos, cards, card_comments, card_labels, chat_sessions, chat_messages, settings.
- **Config** (`src/config.ts`): port 3001, maxWorkers 5, workerRestartDelay 3s, maxWorkerRestarts 3.

### Client (`client/`)

React 19 + Vite + Zustand + Tailwind CSS 3. Entry: `src/main.tsx` → `src/App.tsx`.

- **Stores** (`src/stores/`): Zustand state — boardStore (cards CRUD), uiStore (modals/tabs), repoStore, chatStore (streaming), fileStore, workerStore
- **API layer** (`src/api/`): `apiFetch` wrapper in `client.ts`, module-specific files for cards, repos, chats, pr, files, settings
- **Components** (`src/components/`): layout, board (KanbanBoard/Column/CardTile), card-detail (modal with Details/Code/PR/AI Chat tabs), sidebar, settings, ui (shared primitives)
- **Types** (`src/types/`): `models.ts` (Card, Repo, ChatSession, etc.), `ws.ts` (WebSocket message types)
- **Vite proxy**: `/api` and `/ws` proxy to `localhost:3001`

### Key Patterns

- **Card statuses**: backlog → priority → in_progress → done. Moving to in_progress spawns a worker process.
- **Real-time flow**: Worker process → Node IPC → WebSocket server → all connected clients (chat streaming, file changes, worker status, branch/PR events).
- **TypeScript**: Strict mode, ES2022 target, bundler module resolution. Base config in root `tsconfig.base.json`, extended by each workspace.
