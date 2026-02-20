# Architecture

## Overview

**My Team** is a Kanban-style project management application with embedded AI-assisted development. Each card on the board represents a unit of work that can have its own Git branch, a dedicated Claude Code worker process, and a GitHub pull request — turning a task tracker into an integrated development environment.

The system is a **monorepo** (`npm workspaces`) with two packages:

| Package | Stack | Port |
|---------|-------|------|
| `server/` | Express 5, SQLite (better-sqlite3), WebSocket (ws) | 3001 |
| `client/` | React 19, Vite 6, Zustand 5, Tailwind CSS 3 | 5173 |

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                              │
│  React 19 + Zustand + Tailwind                              │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐                 │
│  │ Board    │  │ Card      │  │ PR/Diff  │                  │
│  │ Store    │  │ Detail    │  │ Panel    │                  │
│  └────┬─────┘  └─────┬─────┘  └────┬─────┘                 │
│       │   REST /api   │   WebSocket │                       │
└───────┼───────────────┼─────────────┼───────────────────────┘
        │               │             │
┌───────┼───────────────┼─────────────┼───────────────────────┐
│       ▼               ▼             ▼        Server         │
│  ┌─────────┐   ┌───────────┐   ┌─────────┐                 │
│  │ Express │   │ WebSocket │   │ Process  │                 │
│  │ Routes  │   │ Server    │◄──│ Manager  │                 │
│  └────┬────┘   └─────┬─────┘   └────┬─────┘                │
│       │              │              │                       │
│       ▼              │         ┌────┴────────┐              │
│  ┌─────────┐         │         │  Worker N   │ (fork)       │
│  │ SQLite  │         │         │ ┌─────────┐ │              │
│  │  (WAL)  │         │         │ │ Claude  │ │              │
│  └─────────┘         │         │ │ Runner  │ │              │
│                      │         │ ├─────────┤ │              │
│                      │◄─ IPC ──│ │ File    │ │              │
│                      │         │ │ Watcher │ │              │
│                      │         │ └─────────┘ │              │
│                      │         └─────────────┘              │
└──────────────────────┼──────────────────────────────────────┘
                       │
                       ▼  (broadcasts to all clients)
                    Browser
```

---

## Core Design Decisions

### 1. One Worker Per Card

When a card moves to `in_progress`, the server forks a dedicated child process (`cardWorker.ts`). This worker owns:

- A **ClaudeRunner** — wraps the Claude Agent SDK, maintains a multi-turn session
- A **FileWatcher** — monitors the card's branch directory for filesystem changes

This isolation means a crash in one Claude session does not affect others. The `ProcessManager` supervises up to 5 concurrent workers with automatic restart (3 attempts, 3 s delay).

### 2. SQLite with WAL

SQLite in WAL (write-ahead logging) mode provides concurrent reads during writes without a separate database server. Foreign keys are enforced and cascading deletes keep referential integrity (deleting a card removes its comments, labels, and chat messages).

### 3. Git Worktrees Over Branches

Each card gets its own Git worktree (`.worktrees/<branch-name>/`), not just a branch. This allows multiple cards to work on different branches of the same repo simultaneously — each with its own working directory — without conflicts.

### 4. WebSocket for Real-Time Streaming

Claude's responses stream token-by-token through: `Claude SDK → Worker IPC → ProcessManager EventEmitter → WebSocket → Zustand store → React render`. This chain gives sub-second perceived latency for AI responses.

### 5. Zustand Over Redux

Minimal boilerplate, no action types or reducers. Each domain (board, UI, repos, workers) has its own isolated store. Stores are directly consumed via hooks with selector functions for fine-grained re-renders.

---

## Server

### Entry & Middleware

```
src/index.ts          → Creates HTTP server, initializes DB, sets up WebSocket,
                        re-spawns workers for in_progress cards on startup,
                        graceful shutdown on SIGTERM/SIGINT
src/app.ts            → Express app: cors → json parser → HTTP logger → routes → error handler
src/config.ts         → { port: 3001, dbPath, maxWorkers: 5, workerRestartDelay: 3000, maxWorkerRestarts: 3 }
```

### Database

```
src/db/connection.ts  → Singleton better-sqlite3 instance (WAL mode, foreign keys ON)
src/db/schema.ts      → initializeDatabase() creates tables if not exists
```

**Schema (8 tables):**

| Table | Purpose | Key Constraints |
|-------|---------|-----------------|
| `repos` | Git repositories | `local_path` UNIQUE |
| `cards` | Kanban cards | `status` CHECK (backlog/priority/in_progress/done), FK → repos |
| `card_comments` | User & Claude comments | `author` CHECK (user/claude/system), CASCADE delete |
| `card_labels` | Color-coded tags | CASCADE delete |
| `chat_sessions` | Persistent chat sessions | FK → cards, CASCADE delete |
| `chat_messages` | Messages in sessions | `role` CHECK (user/assistant/system/tool_use/tool_result), CASCADE delete |
| `settings` | Key-value config | `key` PRIMARY KEY |

### Routes

All mounted under `/api/`:

| Route file | Prefix | Responsibilities |
|------------|--------|-----------------|
| `cards.ts` | `/api/cards` | Full CRUD, move/reorder, comments, labels, branch creation, git status/log/diff |
| `repos.ts` | `/api/repos` | CRUD for repositories, branch listing |
| `files.ts` | `/api/cards/:cardId/files` | Directory tree, file read/write (path-traversal protected) |
| `pr.ts` | `/api/cards/:cardId/pr` | Create/fetch PR, PR files, PR comments (via GitHub API) |
| `settings.ts` | `/api/settings` | Key-value settings (GitHub PAT storage) |
| `ide.ts` | `/api/cards/:cardId/ide` | Launch external IDE (Cursor) on branch directory |

**Card move side-effects** (in `cards.ts`):
- Move → `in_progress`: spawns worker via `processManager.spawnWorker()`
- Move away from `in_progress`: kills worker via `processManager.killWorker()`

### Services

| Service | Pattern | Responsibility |
|---------|---------|---------------|
| `CardService` | Static object | Cards CRUD, position management (float-based ordering) |
| `RepoService` | Static object | Repos CRUD, validates path exists and is a git repo on create |
| `SettingsService` | Static object | Key-value settings upsert |
| `GitService` | Class singleton | Worktree create/remove, branch list, status, diff, log, push, commit |
| `GitHubService` | Class singleton | PR create/fetch, PR files/comments/checks via Octokit |
| `FileService` | Class singleton | Directory tree (max depth 5, respects .gitignore), file read/write |
| `ProcessManager` | Class singleton (EventEmitter) | Worker lifecycle: spawn, kill, restart, IPC bridge, status tracking |

### Worker System

```
src/worker/
├── cardWorker.ts      → Forked child process entry point
├── claudeRunner.ts    → Claude Agent SDK wrapper (streaming query)
└── fileWatcher.ts     → fs.watch with debounce (500ms) and ignore patterns
```

**Worker lifecycle:**

```
fork(cardWorker.ts)
  │
  ├── Creates ClaudeRunner({ cwd: branchDir, cardId })
  ├── Creates FileWatcher(branchDir)
  ├── Sends IPC: { type: 'ready' }
  ├── Sends IPC: { type: 'status', status: 'idle' }
  │
  │   ◄── IPC from parent: { type: 'chat:send', message }
  │       └── claudeRunner.run(message, sessionId, callback)
  │           ├── Streams: chat:token, chat:tool_use, chat:tool_result
  │           └── Completes: chat:message_complete { content, costUsd, sessionId }
  │
  │   ◄── IPC from parent: { type: 'chat:abort' }
  │       └── claudeRunner.abort()
  │
  │   ◄── IPC from parent: { type: 'shutdown' }
  │       └── Cleanup and process.exit(0)
  │
  └── FileWatcher detects changes → IPC: { type: 'files:changed', files[] }
```

**ClaudeRunner details:**
- Calls `query()` from `@anthropic-ai/claude-agent-sdk`
- Runs with `permissionMode: 'bypassPermissions'`, `maxTurns: 50`
- Maintains `sessionId` across messages for multi-turn conversation continuity
- Strips Claude Code environment variables to prevent nested sessions
- Logs all SDK interactions to `server/data/logs/card-<id>-run<N>.log`

### WebSocket

```
src/ws/
├── index.ts           → WebSocketServer on /ws path, bridges ProcessManager events to clients
└── chatHandler.ts     → Handles incoming WS messages: chat:send, chat:abort, worker:status, ping
```

**Event flow:**
- Worker IPC → `ProcessManager.emit('worker:event')` → broadcast to all WebSocket clients
- `chat:message_complete` is intercepted to persist Claude's response as a `card_comment` in the database
- On client connect, server sends current `worker:statuses` snapshot

---

## Client

### Entry

```
src/main.tsx  → React 19 root render with StrictMode
src/App.tsx   → Initializes WebSocket, fetches repos, conditionally renders
                KanbanBoard (board view) or CardDetailPage (full-screen detail)
```

### State Management (Zustand)

| Store | Key State | Responsibility |
|-------|-----------|---------------|
| `boardStore` | `cards[]`, `loading`, `error` | Cards CRUD, optimistic move with rollback |
| `uiStore` | `selectedCardId`, dialog flags, `isSidebarCollapsed` | UI state, navigation |
| `repoStore` | `repos[]`, `loading` | Repository list |
| `workerStore` | `statuses{}`, `streamingText{}`, `isStreaming{}`, `commentsVersion{}` | Per-card worker state, streaming text accumulation, comment refetch triggers |

### API Layer

```
src/api/
├── client.ts      → apiFetch<T>(path, options) — base wrapper, prepends /api, JSON handling
├── cards.ts       → Card CRUD + branch-diff fetch
├── repos.ts       → Repo CRUD
├── pr.ts          → PR create/fetch/files/comments
└── settings.ts    → Settings get/set
```

### WebSocket Hook

`src/hooks/useWebSocket.ts` — singleton WebSocket with reference-counted subscriptions:

- Auto-reconnect with exponential backoff (1 s → 10 s)
- Dispatches incoming messages directly to Zustand stores:
  - `chat:token` → `workerStore.appendStreamingText()`
  - `chat:message_complete` → `workerStore.notifyCommentsChanged()` (triggers comment refetch)
  - `status` → `workerStore.setWorkerStatus()`
  - `worker:statuses` → bulk status update
  - `worker:exit` → cleanup
- Returns `{ sendChatMessage, abortChat, sendMessage }`

### Component Hierarchy

```
App
├── AppLayout
│   ├── Sidebar (collapsible, w-60 ↔ w-16)
│   │   ├── Logo + collapse toggle
│   │   ├── RepoList (expandable repo details)
│   │   └── Settings button
│   │
│   └── Main content area
│       ├── KanbanBoard (when no card selected)
│       │   ├── BoardHeader (title + "New Card" button)
│       │   └── DndContext (dnd-kit)
│       │       └── KanbanColumn × 4 (backlog, priority, in_progress, done)
│       │           └── CardTile[] (draggable, status-colored border)
│       │
│       └── CardDetailPage (when card selected, full-screen)
│           ├── CardDetailHeader (back, editable title, status dropdown, delete)
│           └── Two-column layout
│               ├── DetailsTab (left, 2/5 width)
│               │   ├── LabelManager (color-coded tags)
│               │   ├── Description (textarea, save on blur)
│               │   ├── BranchInfo (create or display branch)
│               │   └── CommentsList (user comments + Claude chat)
│               └── PRDiffPanel (right, flex-1)
│                   ├── Diff header (branch info, file count, view mode toggle)
│                   ├── FileNav (collapsible file tree with status badges)
│                   └── FileDiff[] (split or unified via @git-diff-view/react)
│
├── NewCardDialog (portal)
├── AddRepoDialog (portal)
└── SettingsDialog (portal)
```

### UI Primitives (`src/components/ui/`)

`Button` (variants: default/primary/danger/ghost), `Input`, `Select`, `Badge`, `Dialog` (portal + backdrop + escape), `Spinner`

### Key Hooks

| Hook | Purpose |
|------|---------|
| `useWebSocket` | Singleton WS connection, message dispatch to stores |
| `useCardDetail` | Convenience wrapper for card detail page state and actions |
| `useDebouncedSave` | Generic debouncer for auto-save operations |

---

## Data Flow: End-to-End Examples

### Moving a Card to "In Progress"

```
1. User drags CardTile to in_progress column
2. dnd-kit onDragEnd → boardStore.moveCard(id, 'in_progress', position)
3. Optimistic update: card moves in local state immediately
4. PATCH /api/cards/:id/move → CardService.move() updates DB
5. Route detects status = in_progress → processManager.spawnWorker(cardId, branchDir)
6. Node fork() creates cardWorker.ts child process
7. Worker initializes ClaudeRunner + FileWatcher
8. Worker sends IPC: { type: 'ready' } → { type: 'status', status: 'idle' }
9. ProcessManager emits 'worker:event' → WebSocket broadcasts to all clients
10. Client workerStore updates → WorkerStatusBadge shows green "idle"
```

### Chatting with Claude

```
1. User types in CommentsList textarea, clicks "Ask Claude"
2. useWebSocket.sendChatMessage(cardId, message)
3. WS → server chatHandler: persists user message as card_comment(author='user')
4. processManager.sendInstruction(cardId, message) → IPC to worker
5. cardWorker.handleChatSend() → claudeRunner.run(message, sessionId, onEvent)
6. Claude SDK streams responses:
   ├── chat:token → IPC → ProcessManager → WS → workerStore.appendStreamingText()
   │   └── CommentsList renders streaming bubble with live text
   ├── chat:tool_use → IPC → WS → client logs tool invocation
   └── chat:message_complete → IPC → ProcessManager → WS
       ├── WS server intercepts: saves as card_comment(author='claude')
       └── Client: workerStore.notifyCommentsChanged() → CommentsList refetches comments
```

### Creating a Pull Request

```
1. User clicks "Create PR" in PRDiffPanel
2. POST /api/cards/:cardId/pr { title, body }
3. Server: gitService.pushBranch() → githubService.createPR() via Octokit
4. Stores pr_number, pr_url, pr_state on card
5. Response → client updates card → PR badge appears with GitHub link
```

---

## Security

| Concern | Mitigation |
|---------|-----------|
| Path traversal | `isPathSafe()` validates all file paths against allowed base directory |
| Nested Claude sessions | Worker strips `CLAUDE_*` / `ANTHROPIC_*` env vars before spawning SDK |
| GitHub credentials | PAT stored in SQLite settings table, never exposed to client |
| Worker isolation | Each worker is a separate process; crash in one does not affect others |
| Graceful shutdown | `SIGTERM`/`SIGINT` → `processManager.killAll()` with 5 s timeout before `SIGKILL` |
| Input validation | Express routes validate required fields; DB uses CHECK constraints |

---

## Build & Development

```bash
npm install              # Install all workspace dependencies
npm run dev              # Run server (tsx watch :3001) + client (vite :5173) concurrently
npm run build            # Build server (tsc → dist/) then client (tsc -b + vite build)
```

**Dev proxy:** Vite proxies `/api` and `/ws` to `localhost:3001`, so the client dev server handles both static assets and API requests from a single origin.

**TypeScript:** Strict mode, ES2022 target, bundler module resolution. Base config in root `tsconfig.base.json`, extended by each workspace.

---

## Dependencies

### Server

| Dependency | Purpose |
|-----------|---------|
| `express@5` | HTTP framework |
| `better-sqlite3` | Embedded database |
| `ws` | WebSocket server |
| `simple-git` | Git CLI wrapper |
| `@octokit/rest` | GitHub API |
| `@anthropic-ai/claude-agent-sdk` | Claude integration |
| `uuid` | ID generation |
| `tsx` (dev) | TypeScript execution and worker forking |

### Client

| Dependency | Purpose |
|-----------|---------|
| `react@19` / `react-dom@19` | UI framework |
| `zustand@5` | State management |
| `@dnd-kit/core` / `@dnd-kit/sortable` | Drag-and-drop for Kanban |
| `@git-diff-view/react` | Diff visualization (split/unified) |
| `tailwindcss@3` | Utility-first CSS |
| `clsx` + `tailwind-merge` | Class name merging |
| `react-markdown` | Markdown rendering in comments |

---

## Directory Structure

```
my-team/
├── package.json                  # Workspace root
├── tsconfig.base.json            # Shared TypeScript config
├── CLAUDE.md                     # AI assistant instructions
│
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── data/                     # SQLite DB + logs (gitignored)
│   │   ├── kanban.db
│   │   └── logs/
│   └── src/
│       ├── index.ts              # Entry: HTTP server + DB init + WS + worker recovery
│       ├── app.ts                # Express app factory
│       ├── config.ts             # Runtime configuration
│       ├── db/
│       │   ├── connection.ts     # SQLite singleton (WAL, foreign keys)
│       │   └── schema.ts         # Table creation
│       ├── routes/
│       │   ├── index.ts          # Route aggregator
│       │   ├── cards.ts          # Card CRUD + git ops + worker lifecycle
│       │   ├── repos.ts          # Repo CRUD
│       │   ├── files.ts          # File tree + read/write
│       │   ├── pr.ts             # GitHub PR operations
│       │   ├── settings.ts       # Key-value settings
│       │   └── ide.ts            # External IDE launcher
│       ├── services/
│       │   ├── CardService.ts    # Card business logic
│       │   ├── RepoService.ts    # Repo business logic
│       │   ├── SettingsService.ts
│       │   ├── GitService.ts     # Worktrees, branches, diffs
│       │   ├── GitHubService.ts  # PR operations via Octokit
│       │   ├── FileService.ts    # File tree + read/write
│       │   └── ProcessManager.ts # Worker supervisor (EventEmitter)
│       ├── worker/
│       │   ├── cardWorker.ts     # Forked process entry point
│       │   ├── claudeRunner.ts   # Claude Agent SDK wrapper
│       │   └── fileWatcher.ts    # fs.watch with debounce
│       ├── ws/
│       │   ├── index.ts          # WebSocket server + event bridge
│       │   └── chatHandler.ts    # WS message routing
│       ├── middleware/
│       │   ├── errorHandler.ts   # Global error handler
│       │   └── validatePath.ts   # Path traversal guard
│       └── utils/
│           ├── params.ts         # Express 5 param helper
│           ├── pathSecurity.ts   # isPathSafe / sanitizePath
│           ├── branchNaming.ts   # Title → feature/branch-name
│           └── sdkLogger.ts      # Claude SDK interaction logger
│
├── client/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts            # Dev server + proxy config
│   ├── tailwind.config.ts
│   ├── postcss.config.js
│   ├── index.html
│   └── src/
│       ├── main.tsx              # React root
│       ├── App.tsx               # Root component + WS init
│       ├── api/
│       │   ├── client.ts         # apiFetch wrapper
│       │   ├── cards.ts
│       │   ├── repos.ts
│       │   ├── pr.ts
│       │   └── settings.ts
│       ├── stores/
│       │   ├── boardStore.ts     # Cards state + optimistic updates
│       │   ├── uiStore.ts        # UI state (selection, dialogs, sidebar)
│       │   ├── repoStore.ts      # Repos state
│       │   └── workerStore.ts    # Worker statuses + streaming text
│       ├── hooks/
│       │   ├── useWebSocket.ts   # Singleton WS + store dispatch
│       │   ├── useCardDetail.ts  # Card detail convenience hook
│       │   └── useDebouncedSave.ts
│       ├── components/
│       │   ├── layout/
│       │   │   ├── AppLayout.tsx
│       │   │   └── Sidebar.tsx   # Collapsible sidebar
│       │   ├── board/
│       │   │   ├── KanbanBoard.tsx
│       │   │   ├── KanbanColumn.tsx
│       │   │   ├── BoardHeader.tsx
│       │   │   └── CardTile.tsx
│       │   ├── card-detail/
│       │   │   ├── CardDetailPage.tsx
│       │   │   ├── CardDetailHeader.tsx
│       │   │   ├── DetailsTab.tsx
│       │   │   ├── CommentsList.tsx
│       │   │   ├── BranchInfo.tsx
│       │   │   ├── LabelManager.tsx
│       │   │   ├── PRDiffPanel.tsx
│       │   │   ├── WorkerStatusBadge.tsx
│       │   │   └── StreamingIndicator.tsx
│       │   ├── sidebar/
│       │   │   ├── RepoList.tsx
│       │   │   └── AddRepoDialog.tsx
│       │   ├── settings/
│       │   │   ├── SettingsDialog.tsx
│       │   │   └── NewCardDialog.tsx
│       │   └── ui/               # Shared primitives
│       │       ├── Button.tsx
│       │       ├── Input.tsx
│       │       ├── Select.tsx
│       │       ├── Badge.tsx
│       │       ├── Dialog.tsx
│       │       └── Spinner.tsx
│       ├── types/
│       │   ├── models.ts         # Card, Repo, CardLabel, CardComment, CardStatus
│       │   └── ws.ts             # WebSocket message types
│       └── utils/
│           ├── cn.ts             # clsx + tailwind-merge
│           └── branchNaming.ts   # Title → branch name
│
└── doc/
    └── ARCHITECTURE.md           # This file
```
