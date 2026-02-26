import { fork, ChildProcess, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { EventEmitter } from 'node:events';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface PRWorkerInfo {
  process: ChildProcess;
  cardId: string;
}

export interface PRContext {
  cardId: string;
  branchDir: string;
  branchName: string;
  baseBranch: string;
  githubOwner: string;
  githubRepo: string;
  pat: string;
  title: string;
  body: string;
  /** 'create' for new PR, 'update' to commit+push to existing PR */
  mode: 'create' | 'update';
  /** Existing PR number when mode is 'update' */
  prNumber?: number;
}

/**
 * PRProcessManager — manages PR worker processes.
 * One PR worker per card at a time (one-shot, no auto-restart).
 * Handles: git commit → git push → GitHub PR creation.
 */
export class PRProcessManager extends EventEmitter {
  private workers = new Map<string, PRWorkerInfo>();
  private workerModulePath: string;

  constructor() {
    super();
    this.workerModulePath = path.resolve(__dirname, '../worker/prWorker.ts');
  }

  hasWorker(cardId: string): boolean {
    return this.workers.has(cardId);
  }

  createPR(context: PRContext): boolean {
    if (this.workers.has(context.cardId)) {
      this.emit('pr:event', context.cardId, {
        type: 'pr:error',
        error: 'A PR creation is already in progress for this card',
      });
      return false;
    }

    if (!this.spawnWorker(context)) {
      return false;
    }

    // Send context to the worker
    const worker = this.workers.get(context.cardId);
    if (worker) {
      try {
        worker.process.send({ type: 'pr:start', context });
      } catch {
        this.emit('pr:event', context.cardId, {
          type: 'pr:error',
          error: 'Failed to send context to PR worker',
        });
        return false;
      }
    }

    return true;
  }

  private spawnWorker(context: PRContext): boolean {
    const { cardId, branchDir } = context;
    if (this.workers.has(cardId)) return false;

    const { CLAUDECODE, CLAUDE_CODE_SSE_PORT, CLAUDE_CODE_ENTRYPOINT, ...cleanEnv } = process.env;

    console.log(`[PRProcessManager] Forking PR worker for card ${cardId}`);
    const child = fork(this.workerModulePath, [], {
      execArgv: ['--import', 'tsx'],
      env: {
        ...cleanEnv,
        WORKER_CARD_ID: cardId,
        WORKER_BRANCH_DIR: branchDir,
      },
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    });

    const info: PRWorkerInfo = { process: child, cardId };
    this.workers.set(cardId, info);

    child.stdout?.on('data', (data: Buffer) => {
      console.log(`[PRWorker:${cardId}] ${data.toString().trim()}`);
    });
    child.stderr?.on('data', (data: Buffer) => {
      console.error(`[PRWorker:${cardId}] ${data.toString().trim()}`);
    });

    child.on('message', (msg: Record<string, unknown>) => {
      this.emit('pr:event', cardId, msg);

      // Auto-cleanup when PR completes or errors
      if (msg.type === 'pr:complete' || msg.type === 'pr:error') {
        setTimeout(() => this.cleanupWorker(cardId), 2000);
      }
    });

    child.on('exit', (code, signal) => {
      console.log(`[PRProcessManager] PR worker ${cardId} exited: code=${code}, signal=${signal}`);
      if (child.pid) {
        this.killProcessTree(child.pid);
      }
      this.workers.delete(cardId);
      this.emit('pr:exit', cardId, code);
    });

    child.on('error', (err) => {
      console.error(`[PRProcessManager] PR worker ${cardId} error:`, err.message);
      this.emit('pr:event', cardId, {
        type: 'pr:error',
        error: err.message,
      });
    });

    return true;
  }

  private cleanupWorker(cardId: string): void {
    const worker = this.workers.get(cardId);
    if (!worker) return;

    const pid = worker.process.pid;
    console.log(`[PRProcessManager] Cleaning up PR worker ${cardId} (pid=${pid})`);

    try {
      worker.process.send({ type: 'shutdown' });
    } catch {
      // process may already be dead
    }

    setTimeout(() => {
      if (this.workers.has(cardId)) {
        console.log(`[PRProcessManager] Force-killing PR worker ${cardId}`);
        if (pid) this.killProcessTree(pid);
        try { worker.process.kill('SIGKILL'); } catch {}
        this.workers.delete(cardId);
        this.emit('pr:exit', cardId, null);
      }
    }, 3000);
  }

  private killProcessTree(pid: number): void {
    try {
      execSync(`pkill -TERM -P ${pid} 2>/dev/null || true`, { timeout: 3000 });
      setTimeout(() => {
        try {
          execSync(`pkill -KILL -P ${pid} 2>/dev/null || true`, { timeout: 3000 });
        } catch {}
      }, 1000);
    } catch {
      // pkill may fail if processes already exited
    }
  }

  async killAll(): Promise<void> {
    const promises = Array.from(this.workers.entries()).map(([cardId, worker]) => {
      return new Promise<void>((resolve) => {
        try { worker.process.send({ type: 'shutdown' }); } catch {}
        const timeout = setTimeout(() => {
          if (worker.process.pid) this.killProcessTree(worker.process.pid);
          try { worker.process.kill('SIGKILL'); } catch {}
          this.workers.delete(cardId);
          resolve();
        }, 3000);
        worker.process.on('exit', () => {
          clearTimeout(timeout);
          this.workers.delete(cardId);
          resolve();
        });
      });
    });
    await Promise.all(promises);
  }
}

export const prProcessManager = new PRProcessManager();
