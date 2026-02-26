/**
 * DevEnvironment — core interfaces for isolated development environments.
 *
 * A DevEnvironment is an isolated workspace (Docker container, remote SSH box, etc.)
 * where workers run. The abstraction is provider-agnostic: Docker today, remote
 * Docker or SSH tomorrow.
 */

// ---- Resource Limits ----

export interface ResourceLimits {
  /** Memory limit, e.g. '4g', '512m' */
  memory?: string;
  /** Number of CPUs */
  cpus?: number;
  /** Max number of PIDs */
  pidsLimit?: number;
}

// ---- Environment Configuration ----

export interface DevEnvConfig {
  cardId: string;
  /** Host path to the repo root (needed for .git/ access by worktrees) */
  repoPath: string;
  /** Host path to the card's worktree */
  branchDir: string;
  /** Resolved Docker image (or equivalent for other providers) */
  image?: string;
  /** Resource limits for the environment */
  resources?: ResourceLimits;
}

// ---- Remote Process ----

export interface RemoteProcess {
  /** Process identifier within the environment */
  readonly pid: string;
  kill(signal?: string): Promise<void>;
  onExit(handler: (code: number | null) => void): void;
}

// ---- Exec Result ----

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

// ---- DevEnvironment ----

export type DevEnvStatus = 'provisioning' | 'ready' | 'stopping' | 'stopped' | 'error';

export interface DevEnvironment {
  readonly id: string;
  readonly cardId: string;
  /** Path INSIDE the environment where the workspace is mounted */
  readonly workspacePath: string;
  status: DevEnvStatus;

  /** Run a command inside the environment (short-lived, waits for completion) */
  exec(command: string, opts?: {
    cwd?: string;
    env?: Record<string, string>;
    timeout?: number;
  }): Promise<ExecResult>;

  /** Start a long-running process inside the environment */
  spawn(command: string, opts?: {
    cwd?: string;
    env?: Record<string, string>;
  }): Promise<RemoteProcess>;

  /** Returns address the environment uses to reach the host (e.g. host.docker.internal) */
  getHostAddress(): string;

  /** Expose a port from inside the environment to the host */
  exposePort(innerPort: number): Promise<{ hostPort: number; url: string }>;

  /** Tear down the environment and all processes inside it */
  destroy(): Promise<void>;
}

// ---- Provider ----

export interface DevEnvironmentProvider {
  readonly type: string;
  /** Create a new environment for a card */
  create(config: DevEnvConfig): Promise<DevEnvironment>;
  /** List all active environments managed by this provider */
  listActive(): Promise<DevEnvironment[]>;
  /** Clean up orphaned environments (e.g. on server restart) */
  cleanupOrphans?(activeCardIds: Set<string>): Promise<void>;
}
