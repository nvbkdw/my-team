# Container Dev Environment

Isolated development environments for AI agent workers. Docker containers provide network namespace isolation (no port conflicts), PID namespace isolation (no process leaks), and resource limits (cgroups) for cards running Claude Code sessions.

---

## Problem

Workers (`CardWorker`, `EvalWorker`) run Claude Code sessions that spawn arbitrary subprocesses via the bash tool — dev servers (`vite`, `next`), test runners, build tools. These run as direct children of the worker's `fork()`-ed process on the host, causing:

1. **Port conflicts** — Two cards both start `vite` on port 3000
2. **Process leaks** — Claude starts a dev server, the worker exits, the server orphans
3. **No resource limits** — A runaway build can consume all host memory/CPU

---

## Design Principles

| # | Principle | Implication |
|---|-----------|-------------|
| 1 | **Additive, not replacement** | `DEVENV_PROVIDER=local` (default) keeps everything as fork()-only. Docker is opt-in. |
| 2 | **Worker-agnostic** | The environment is a generic "dev box"; workers are processes inside it. |
| 3 | **Provider-agnostic** | Docker today, remote SSH / remote Docker tomorrow. All share `DevEnvironment` interface. |
| 4 | **One environment per card** | All containerized workers for a card share the same container. |
| 5 | **Hybrid coexistence** | Heavyweight workers (CardWorker, EvalWorker) in containers; lightweight workers (PRWorker) stay as `fork()`. |

### Which Workers Need Containerization?

| Worker | Runs Claude w/ bash? | Spawns dev servers? | Containerized? |
|--------|---------------------|--------------------|--------------------|
| CardWorker | Yes — multi-turn session with full tool access | Yes — Claude starts vite, next, etc. | **YES** |
| EvalWorker | Yes — single-turn with bash for verification | Possibly — runs tests, starts services | **YES** |
| PRWorker | No — text-only Claude (commit msgs, PR summaries) + git CLI | No | **NO** |

---

## Architecture

### Core Abstraction: DevEnvironment

```
DevEnvironmentManager
├── Provisions one environment per card (card → in_progress)
├── Destroys environment when card leaves in_progress
├── Selects provider based on config
│
├── DockerProvider (implemented)
│   ├── Creates Docker container with workspace bind-mount
│   ├── exec() → docker exec (short-lived commands)
│   ├── spawn() → docker exec (long-running processes)
│   ├── getHostAddress() → host.docker.internal
│   ├── exposePort() → pre-allocated port mappings
│   └── destroy() → docker stop + rm
│
├── RemoteDockerProvider (future)
│   └── Same as Docker but connects to remote daemon via SSH
│
└── SSHProvider (future)
    └── SSH into bare machine, deploy worker code via SCP
```

### Worker Deployment Model

Workers don't know about Docker or SSH. Two execution paths coexist:

```
                    ┌──────────────────────────────────┐
                    │          Worker Code              │
                    │  cardWorker / evalWorker / prWorker│
                    │  Uses WorkerTransport abstraction │
                    └────────────┬─────────────────────┘
                                 │
                    ┌────────────┴─────────────┐
                    │                          │
           ┌───────▼────────┐      ┌──────────▼──────────┐
           │ Local Process   │      │ DevEnvironment       │
           │ (fork + IPC)    │      │ (Docker/SSH + WS)    │
           │                 │      │                      │
           │ PRWorker        │      │ CardWorker           │
           │ (lightweight,   │      │ EvalWorker           │
           │  no bash tool)  │      │ (Claude + bash tool) │
           └─────────────────┘      └──────────────────────┘
```

---

## Interfaces

### DevEnvironment

```typescript
interface DevEnvironment {
  readonly id: string;
  readonly cardId: string;
  readonly workspacePath: string;  // path INSIDE the environment
  status: 'provisioning' | 'ready' | 'stopping' | 'stopped' | 'error';

  exec(command: string, opts?: {
    cwd?: string;
    env?: Record<string, string>;
    timeout?: number;
  }): Promise<{ stdout: string; stderr: string; exitCode: number }>;

  spawn(command: string, opts?: {
    cwd?: string;
    env?: Record<string, string>;
  }): Promise<RemoteProcess>;

  getHostAddress(): string;
  exposePort(innerPort: number): Promise<{ hostPort: number; url: string }>;
  destroy(): Promise<void>;
}
```

### DevEnvironmentProvider

```typescript
interface DevEnvironmentProvider {
  readonly type: string;  // 'docker' | 'remote-docker' | 'ssh'
  create(config: DevEnvConfig): Promise<DevEnvironment>;
  listActive(): Promise<DevEnvironment[]>;
  cleanupOrphans?(activeCardIds: Set<string>): Promise<void>;
}
```

### WorkerTransport

Abstraction over the communication channel between workers and the host server:

```typescript
interface WorkerTransport {
  send(msg: Record<string, unknown>): void;
  onMessage: ((msg: Record<string, unknown>) => void) | null;
  close(): void;
  ready(): Promise<void>;
}
```

Two implementations:
- **IpcTransport** — wraps `process.send()` / `process.on('message')` (local fork mode)
- **WsTransport** — WebSocket connection to `ws://host:3001/ws/worker` (container mode)

Auto-selected by `createTransport()` based on `WORKER_WS_URL` env var.

### Provider Comparison

| Capability | Docker | Remote Docker | SSH (bare) |
|------------|--------|---------------|------------|
| `create()` | `docker run` | `docker -H ssh://... run` | `ssh connect` + setup |
| `exec()` | `docker exec` | same via remote daemon | `ssh execCommand` |
| `spawn()` | `docker exec` (attached) | same | `ssh exec` |
| `getHostAddress()` | `host.docker.internal` | SSH tunnel endpoint | reverse tunnel |
| `exposePort()` | Docker port mapping | same | `ssh -L` forwarding |
| `destroy()` | `docker stop + rm` | same | kill processes + cleanup |
| Workspace | bind mount | bind mount on remote | git clone on remote |

---

## Environment Lifecycle

```
Card → in_progress
  │
  ├── DevEnvironmentManager.provision(cardId, repoPath, branchDir)
  │   ├── resolveImage(repoPath)          // language detect → image selection
  │   ├── provider.create(config)          // Docker: docker run with workspace mount
  │   └── container starts, status → ready
  │
  ├── ProcessManager.spawnWorker(cardId)   // Local fork (existing behavior)
  │   └── CardWorker via IPC (local mode) or via WorkerRunner → Docker exec
  │
  ▼
Environment READY — container running, workspace mounted
  │
  ├── Chat message → CardWorker runs inside container
  │   └── Claude spawns dev servers, builds, etc. — all inside container namespace
  │
  ├── Eval triggered → EvalWorker runs inside SAME container
  │   └── Shares filesystem, can see CardWorker's changes
  │
  ├── PR triggered → PRWorker runs as LOCAL fork() — unchanged
  │   └── Lightweight: git + text-only Claude, no bash tool
  │
  ▼
Card leaves in_progress (→ done / → backlog)
  │
  ├── DevEnvironmentManager.destroy(cardId)   // docker stop kills ALL processes
  ├── ProcessManager.killWorker(cardId)       // Kill local workers
  └── Container removed (AutoRemove: true)
```

### Cold Start Analysis

| Event | Latency | Frequency |
|-------|---------|-----------|
| Card → in_progress (provision environment) | 1-2s | Once per card |
| Start CardWorker (docker exec in running container) | ~100ms | Once per card |
| Start EvalWorker (docker exec in same container) | ~100ms | Per eval trigger |
| PRWorker (local fork) | ~100-200ms | Per PR trigger |

The 1-2s cost happens once when the environment is provisioned. Subsequent workers start in ~100ms since the container is already running.

---

## Docker Provider Details

### Container Setup

Each container:
- **Image**: Language-specific (auto-detected from repo) or base
- **Main process**: `tail -f /dev/null` — keeps container alive; all real work via `docker exec`
- **PID 1**: `tini` (Init: true) for proper signal handling
- **Binds**: Repo path mounted at same host path (worktrees need `.git/`), plus eval/traces data dirs
- **Ports**: 5 pre-allocated dev server ports per container (configurable range 3200-3299)
- **Resources**: 4GB memory, 2 CPUs, 512 PIDs limit (configurable)
- **Labels**: `my-team=devenv`, `my-team-card-id=<cardId>` (for orphan detection)
- **AutoRemove**: true — container self-cleans on stop

### Port Isolation

Each environment gets 5 pre-mapped ports from a configurable range:

```
Container for Card A:  3000/tcp → 3200, 5173/tcp → 3201, 8080/tcp → 3202, ...
Container for Card B:  3000/tcp → 3205, 5173/tcp → 3206, 8080/tcp → 3207, ...
```

Both cards can start `vite :3000` inside their containers — no conflict.

### Orphan Cleanup

On server startup, queries Docker for containers with `my-team=devenv` label. Any container whose card is not in `in_progress` status gets stopped. Containers whose cards are still active get re-attached.

---

## Communication: IPC → WebSocket Bridge

### Local Mode (fork + IPC)

```
CardWorker (child process) ──IPC──→ ProcessManager ──EventEmitter──→ WebSocket Server ──→ Browser
```

### Container Mode (docker exec + WebSocket)

```
CardWorker (inside container) ──WS──→ /ws/worker endpoint ──→ WorkerWsManager ──EventEmitter──→ WebSocket Server ──→ Browser
```

Message format is identical in both modes. The `WorkerWsManager` emits the same event types (`worker:event`, `worker:exit`, `eval:event`, `eval:exit`) as `ProcessManager` and `EvalProcessManager`, so the main WebSocket bridge code handles both transparently.

### Container Worker Boot Sequence

```
1. DockerProvider.spawn('npx tsx /app/worker/containerEntry.ts', { env: { WORKER_TYPE, WORKER_WS_URL, ... } })
2. containerEntry.ts reads WORKER_TYPE → imports cardWorker.ts or evalWorker.ts
3. Worker calls createTransport() → detects WORKER_WS_URL → creates WsTransport
4. WsTransport connects to ws://host.docker.internal:3001/ws/worker
5. Sends { type: 'register', cardId, workerType }
6. WorkerWsManager maps connection to (cardId, workerType)
7. Worker sends { type: 'ready' } → bridged to browser via WebSocket
8. All subsequent messages use same format as IPC
```

---

## Image Strategy

### Tiered Images

```
node:20-slim
└── my-team-base (git, curl, jq, ripgrep, tsx, worker code)   ~300MB
    ├── my-team-node    (+pnpm, yarn, bun)                     ~400MB
    ├── my-team-python  (+python3, pip, poetry, uv)             ~600MB
    ├── my-team-rust    (+rustup, cargo)                        ~1.2GB
    ├── my-team-go      (+go toolchain)                         ~800MB
    └── my-team-full    (all languages)                         ~3-4GB
```

### Image Resolution Order

```
1. Check repo for .devcontainer/devcontainer.json     → build via @devcontainers/cli (future)
2. Auto-detect language from repo root markers:
   package.json / tsconfig.json                        → my-team-node
   pyproject.toml / requirements.txt / setup.py        → my-team-python
   Cargo.toml                                          → my-team-rust
   go.mod                                              → my-team-go
   Multiple markers                                    → my-team-full
3. Fallback                                            → my-team-full
```

Image is resolved and stored in `repos.docker_image` when a repo is registered (`POST /api/repos`).

---

## Configuration

```typescript
// server/src/config.ts → config.devenv
devenv: {
  provider: 'docker' | 'local',    // env: DEVENV_PROVIDER (default: 'local')
  docker: {
    socketPath: '/var/run/docker.sock',
    images: {
      base:   'my-team-base:latest',
      node:   'my-team-node:latest',
      python: 'my-team-python:latest',
      rust:   'my-team-rust:latest',
      go:     'my-team-go:latest',
      full:   'my-team-full:latest',
    },
    resources: {
      memory: '4g',
      cpus: 2,
      pidsLimit: 512,
    },
    portRangeStart: 3200,
    portRangeEnd: 3299,
    portsPerEnvironment: 5,
    containerStopTimeout: 10,  // seconds
  },
}
```

All values configurable via environment variables (`DEVENV_PROVIDER`, `DEVENV_MEMORY`, `DEVENV_CPUS`, etc.).

---

## File Structure

### New Files

```
server/src/
├── services/
│   ├── devenv/
│   │   ├── DevEnvironment.ts          # Core interfaces
│   │   ├── DevEnvironmentManager.ts   # Environment-per-card lifecycle
│   │   ├── DockerProvider.ts          # Docker implementation (dockerode)
│   │   ├── ImageResolver.ts           # Repo → Docker image resolution
│   │   └── index.ts                   # Re-exports
│   └── WorkerRunner.ts               # Starts workers inside environments
├── worker/
│   ├── transport.ts                   # WorkerTransport + IpcTransport + WsTransport
│   └── containerEntry.ts             # Entry point for workers in containers
└── ws/
    └── workerWsHandler.ts            # /ws/worker endpoint for container workers

docker/
├── Dockerfile.base                    # Base: node:20-slim + tools + worker code
├── Dockerfile.node                    # +pnpm, yarn, bun
├── Dockerfile.python                  # +python3, pip, poetry, uv
├── Dockerfile.rust                    # +rustup, cargo
├── Dockerfile.go                      # +go toolchain
└── Dockerfile.full                    # All languages
```

### Modified Files

| File | Change |
|------|--------|
| `server/src/worker/cardWorker.ts` | Uses `WorkerTransport` instead of `process.send/on` |
| `server/src/worker/evalWorker.ts` | Same transport refactor |
| `server/src/routes/cards.ts` | Provisions/destroys DevEnvironment on card status transitions |
| `server/src/routes/repos.ts` | Resolves Docker image on repo registration |
| `server/src/ws/chatHandler.ts` | Routes messages to containerized workers when available |
| `server/src/ws/index.ts` | Bridges container worker events to UI clients |
| `server/src/index.ts` | Orphan cleanup on startup, DevEnvironment shutdown on exit |
| `server/src/config.ts` | Added `devenv` configuration block |
| `server/src/db/schema.ts` | Added `docker_image` column to `repos` table |
| `server/package.json` | Added `dockerode` dependency |

### Unchanged Files

| File | Why |
|------|-----|
| `server/src/worker/prWorker.ts` | Lightweight, stays on fork() + IPC |
| `server/src/services/PRProcessManager.ts` | Manages PRWorker locally |
| `server/src/worker/claudeRunner.ts` | Runs inside environment, agnostic to transport |
| `server/src/worker/fileWatcher.ts` | Works on bind-mounted directories |

---

## Future Work

### Phase 5: DevContainer Integration
- Add `@devcontainers/cli` dependency
- Extend `ImageResolver` to detect and build from `.devcontainer/devcontainer.json`
- Cache built images by config hash

### Phase 6: Remote Providers
- **RemoteDockerProvider** — dockerode over SSH to a remote Docker daemon
- **SSHProvider** — bare SSH with worker code deployed via SCP + remote Node.js
- Same `DevEnvironment` interface, same `WorkerRunner`, same worker code

### Optimization Opportunities
- **Environment pool** — pre-provision N environments, assign to cards on demand (~100ms vs 1-2s)
- **Image layer caching** — language tools in early layers, worker code in late layers
- **Keep-alive** — don't destroy environment immediately on card → done; hold for 5min in case of undo
