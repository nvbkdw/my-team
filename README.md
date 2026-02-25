# My Team

Imagine a team of AI coding agents working on multiple projects together. My Team is an Orchestra of an AI coding agent team.

The main UI is a Kanban board - just like how human do project planning - however, every card is an AI-powered development environment. Drag a task to "In Progress" and a dedicated Claude Code session spins up — with its own Git branch, file watcher, and streaming AI chat — turning your task tracker into a hands-on coding workbench.

## Why This Exists

Traditional project management tools live in one tab; your IDE lives in another. Context switching between the two is constant. **My Team** collapses that gap: each card on the board is backed by a real Git worktree and a persistent Claude Code session that can read, write, and reason about the code. You plan work *and* execute it in the same interface.

## Key Features

- **Kanban board** with drag-and-drop (backlog / priority / in progress / done)
- **One Claude worker per card** — isolated child processes with automatic restart and crash recovery (up to 5 concurrent)
- **Git worktrees** — each card gets its own working directory, so multiple tasks work on the same repo without conflicts
- **Real-time streaming** — Claude's responses stream token-by-token over WebSocket directly into the card's chat panel
- **Built-in diff viewer** — split or unified diffs powered by `@git-diff-view/react`, right next to the conversation
- **GitHub PR integration** — create, view, and review pull requests without leaving the board
- **File browser & editor** — browse the card's branch directory and read/write files from the UI
- **Dark mode** with a persistent toggle

## Architecture at a Glance

```
Browser (React 19 + Zustand + Tailwind)
   │
   ├── REST /api ──► Express 5 ──► SQLite (WAL)
   │
   └── WebSocket ◄──► Process Manager
                          │
                     ┌────┴────────┐
                     │  Worker N   │  (forked child process)
                     │  Claude SDK │
                     │  File Watch │
                     └─────────────┘
```

| Layer | Stack |
|-------|-------|
| Client | React 19, Vite 6, Zustand 5, Tailwind CSS 3, dnd-kit |
| Server | Express 5, better-sqlite3, ws, simple-git |
| AI | Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) |
| VCS | Git worktrees, Octokit (GitHub API) |

See [`doc/ARCHITECTURE.md`](doc/ARCHITECTURE.md) for the full deep-dive.

## Getting Started

### Prerequisites

- **Node.js** >= 18
- **npm** >= 9 (ships with Node 18+)
- **Git** installed and available on `PATH`
- A **Claude API key** (set as `ANTHROPIC_API_KEY` in your environment)
- *(Optional)* A **GitHub personal access token** for PR features — configurable in Settings

### Install & Run

```bash
git clone https://github.com/<your-username>/my-team.git
cd my-team
npm install
npm run dev
```

This starts both the server (port 3001) and the client dev server (port 5173) concurrently. Open [http://localhost:5173](http://localhost:5173).

### Build for Production

```bash
npm run build        # compiles server (tsc) then client (vite build)
npm run start -w server   # run the compiled server
```

## Usage

1. **Add a repository** — click the "+" in the sidebar and point it at a local Git repo.
2. **Create a card** — give it a title, description, and link it to a repo.
3. **Create a branch** — from the card detail page, create a Git branch (a worktree is set up automatically).
4. **Drag to "In Progress"** — a Claude worker process starts, watching the branch directory for changes.
5. **Chat with Claude** — ask it to implement, debug, or refactor. It operates directly on the card's branch.
6. **Review diffs** — the right panel shows a live diff of all changes on the branch.
7. **Open a PR** — push the branch and create a GitHub pull request, all from the card detail page.
8. **Drag to "Done"** — the worker shuts down and the card is archived.

## Project Structure

```
my-team/
├── server/           # Express API + WebSocket + worker system
│   └── src/
│       ├── routes/       # REST endpoints (cards, repos, files, pr, settings)
│       ├── services/     # Business logic (Git, GitHub, cards, files, process mgmt)
│       ├── worker/       # Forked child processes (Claude runner + file watcher)
│       ├── ws/           # WebSocket server + chat handler
│       └── db/           # SQLite schema + connection
│
├── client/           # React SPA
│   └── src/
│       ├── components/   # Board, card detail, sidebar, settings, UI primitives
│       ├── stores/       # Zustand stores (board, UI, repo, worker)
│       ├── hooks/        # WebSocket, card detail, debounced save
│       └── api/          # REST client wrappers
│
└── doc/              # Architecture documentation
```

## Contributing

Contributions are welcome. A few notes:

- **No test framework yet** — if you'd like to add one, open an issue to discuss the approach first.
- **TypeScript strict mode** is enforced across both workspaces.
- Run `npm run dev` for hot-reload on both client and server during development.
- The Vite dev server proxies `/api` and `/ws` to the Express server, so everything works from a single origin.

## License

MIT
