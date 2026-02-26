import { fork, ChildProcess, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { db } from '../db/connection.js';
import { SubtaskService } from './SubtaskService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface EvalWorkerInfo {
  process: ChildProcess;
  cardId: string;
  branchDir: string;
}

export interface EvalContext {
  cardId: string;
  evalEnvSetup: string;
  evalVerification: string;
  envSubtasks: Array<{ title: string; completed: number }>;
  verifySubtasks: Array<{ title: string; completed: number }>;
  resultFilePath: string;
}

/**
 * EvalProcessManager — manages evaluation worker processes.
 * One eval worker per card at a time (one-shot, no auto-restart).
 */
export class EvalProcessManager extends EventEmitter {
  private workers = new Map<string, EvalWorkerInfo>();
  private workerModulePath: string;
  private evalDataDir: string;

  constructor() {
    super();
    this.workerModulePath = path.resolve(__dirname, '../worker/evalWorker.ts');
    this.evalDataDir = path.resolve(__dirname, '../../data/eval');
    // Ensure eval data directory exists
    fs.mkdirSync(this.evalDataDir, { recursive: true });
  }

  hasWorker(cardId: string): boolean {
    return this.workers.has(cardId);
  }

  /**
   * Convenience method: queries DB for eval criteria + subtasks, spawns worker, sends context.
   * Used by both WS handler (user-triggered) and ProcessManager (agent-triggered).
   */
  runEval(cardId: string, branchDir: string): boolean {
    if (this.workers.has(cardId)) {
      this.emit('eval:event', cardId, {
        type: 'eval:error',
        error: 'An evaluation is already running for this card',
      });
      return false;
    }

    // Query DB for eval criteria
    const card = db
      .prepare('SELECT eval_env_setup, eval_verification FROM cards WHERE id = ?')
      .get(cardId) as { eval_env_setup: string; eval_verification: string } | undefined;

    if (!card) {
      this.emit('eval:event', cardId, {
        type: 'eval:error',
        error: 'Card not found',
      });
      return false;
    }

    // Query subtasks by section
    const envSubtasks = SubtaskService.getByCardId(cardId, 'eval_env').map((s) => ({
      title: s.title,
      completed: s.completed,
    }));
    const verifySubtasks = SubtaskService.getByCardId(cardId, 'eval_verify').map((s) => ({
      title: s.title,
      completed: s.completed,
    }));

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `card-${cardId}-eval-${timestamp}.md`;
    const resultFilePath = path.join(this.evalDataDir, filename);

    // Spawn the eval worker
    if (!this.spawnEvalWorker(cardId, branchDir)) {
      return false;
    }

    // Send eval context to the worker
    const context: EvalContext = {
      cardId,
      evalEnvSetup: card.eval_env_setup ?? '',
      evalVerification: card.eval_verification ?? '',
      envSubtasks,
      verifySubtasks,
      resultFilePath,
    };

    this.sendEvalContext(cardId, context);
    return true;
  }

  private spawnEvalWorker(cardId: string, branchDir: string): boolean {
    if (this.workers.has(cardId)) return false;

    const { CLAUDECODE, CLAUDE_CODE_SSE_PORT, CLAUDE_CODE_ENTRYPOINT, ...cleanEnv } = process.env;

    console.log(`[EvalProcessManager] Forking eval worker for card ${cardId}`);
    const child = fork(this.workerModulePath, [], {
      execArgv: ['--import', 'tsx'],
      env: {
        ...cleanEnv,
        WORKER_CARD_ID: cardId,
        WORKER_BRANCH_DIR: branchDir,
      },
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    });

    const info: EvalWorkerInfo = { process: child, cardId, branchDir };
    this.workers.set(cardId, info);

    child.stdout?.on('data', (data: Buffer) => {
      console.log(`[EvalWorker:${cardId}] ${data.toString().trim()}`);
    });
    child.stderr?.on('data', (data: Buffer) => {
      console.error(`[EvalWorker:${cardId}] ${data.toString().trim()}`);
    });

    child.on('message', (msg: Record<string, unknown>) => {
      this.emit('eval:event', cardId, msg);

      // Auto-cleanup: when eval completes or errors, schedule worker teardown
      if (msg.type === 'eval:complete' || msg.type === 'eval:error') {
        setTimeout(() => this.cleanupWorker(cardId), 2000);
      }
    });

    child.on('exit', (code, signal) => {
      console.log(`[EvalProcessManager] Eval worker ${cardId} exited: code=${code}, signal=${signal}`);
      // Kill any orphaned child processes from the worker's process tree
      if (child.pid) {
        this.killProcessTree(child.pid);
      }
      this.workers.delete(cardId);
      this.emit('eval:exit', cardId, code);
    });

    child.on('error', (err) => {
      console.error(`[EvalProcessManager] Eval worker ${cardId} error:`, err.message);
      this.emit('eval:event', cardId, {
        type: 'eval:error',
        error: err.message,
      });
    });

    return true;
  }

  private sendEvalContext(cardId: string, context: EvalContext): boolean {
    const worker = this.workers.get(cardId);
    if (!worker) return false;
    worker.process.send({ type: 'eval:start', context });
    return true;
  }

  /**
   * Gracefully shut down an eval worker after it signals completion.
   */
  private cleanupWorker(cardId: string): void {
    const worker = this.workers.get(cardId);
    if (!worker) return;

    const pid = worker.process.pid;
    console.log(`[EvalProcessManager] Cleaning up eval worker ${cardId} (pid=${pid})`);

    try {
      worker.process.send({ type: 'shutdown' });
    } catch {
      // process may already be dead
    }

    // Force-kill after a short grace period
    setTimeout(() => {
      if (this.workers.has(cardId)) {
        console.log(`[EvalProcessManager] Force-killing eval worker ${cardId}`);
        if (pid) this.killProcessTree(pid);
        try { worker.process.kill('SIGKILL'); } catch {}
        this.workers.delete(cardId);
        this.emit('eval:exit', cardId, null);
      }
    }, 3000);
  }

  /**
   * Kill all descendant processes of the given PID.
   * Uses pkill on macOS/Linux to clean up any child processes
   * spawned by the Claude SDK session (Bash tools, etc.).
   */
  private killProcessTree(pid: number): void {
    try {
      // Find and kill all child processes of this PID
      execSync(`pkill -TERM -P ${pid} 2>/dev/null || true`, { timeout: 3000 });
      // Small delay then force-kill any survivors
      setTimeout(() => {
        try {
          execSync(`pkill -KILL -P ${pid} 2>/dev/null || true`, { timeout: 3000 });
        } catch {}
      }, 1000);
    } catch {
      // pkill may fail if processes already exited — that's fine
    }
  }

  killEvalWorker(cardId: string): Promise<void> {
    const worker = this.workers.get(cardId);
    if (!worker) return Promise.resolve();

    const pid = worker.process.pid;

    try {
      worker.process.send({ type: 'shutdown' });
    } catch {
      // process may already be dead
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (this.workers.has(cardId)) {
          if (pid) this.killProcessTree(pid);
          try { worker.process.kill('SIGKILL'); } catch {}
          this.workers.delete(cardId);
        }
        resolve();
      }, 5000);

      worker.process.on('exit', () => {
        clearTimeout(timeout);
        if (pid) this.killProcessTree(pid);
        this.workers.delete(cardId);
        resolve();
      });
    });
  }

  async killAll(): Promise<void> {
    const promises = Array.from(this.workers.keys()).map((cardId) =>
      this.killEvalWorker(cardId)
    );
    await Promise.all(promises);
  }

  getEvalDataDir(): string {
    return this.evalDataDir;
  }
}

export const evalProcessManager = new EvalProcessManager();
