import { fork, ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { config } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface WorkerInfo {
  process: ChildProcess;
  cardId: string;
  branchDir: string;
  status: 'idle' | 'running' | 'error';
  restartCount: number;
  lastError?: string;
}

type WorkerEvent =
  | { type: 'status'; status: string; error?: string }
  | { type: 'chat:token'; text: string }
  | { type: 'chat:tool_use'; name: string; input: unknown }
  | { type: 'chat:tool_result'; name: string; result: string }
  | { type: 'chat:message_complete'; content: string; costUsd?: number }
  | { type: 'chat:error'; error: string }
  | { type: 'files:changed'; files: string[] }
  | { type: 'ready' };

/**
 * ProcessManager - Supervisor for card worker processes.
 * Manages lifecycle, IPC routing, and crash recovery.
 */
export class ProcessManager extends EventEmitter {
  private workers = new Map<string, WorkerInfo>();
  private workerModulePath: string;

  constructor() {
    super();
    // Use .ts extension since we run via tsx, not compiled .js
    this.workerModulePath = path.resolve(
      __dirname,
      '../worker/cardWorker.ts'
    );
  }

  get activeWorkerCount(): number {
    return this.workers.size;
  }

  getWorkerStatus(cardId: string): 'idle' | 'running' | 'error' | 'none' {
    const worker = this.workers.get(cardId);
    return worker ? worker.status : 'none';
  }

  getAllWorkerStatuses(): Record<string, { status: string }> {
    const result: Record<string, { status: string }> = {};
    for (const [cardId, info] of this.workers) {
      result[cardId] = { status: info.status };
    }
    return result;
  }

  spawnWorker(cardId: string, branchDir: string): boolean {
    if (this.workers.has(cardId)) {
      console.log(`[ProcessManager] Worker for card ${cardId} already exists`);
      return true;
    }

    if (this.workers.size >= config.maxWorkers) {
      console.warn(
        `[ProcessManager] Max workers (${config.maxWorkers}) reached, cannot spawn for card ${cardId}`
      );
      return false;
    }

    // Strip Claude Code session env vars so workers don't inherit "nested session" markers
    const { CLAUDECODE, CLAUDE_CODE_SSE_PORT, CLAUDE_CODE_ENTRYPOINT, ...cleanEnv } = process.env;

    console.log(`[ProcessManager] Forking worker: ${this.workerModulePath}`);
    const child = fork(this.workerModulePath, [], {
      // Use tsx loader so the forked process can execute .ts files
      execArgv: ['--import', 'tsx'],
      env: {
        ...cleanEnv,
        WORKER_CARD_ID: cardId,
        WORKER_BRANCH_DIR: branchDir,
      },
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    });

    const workerInfo: WorkerInfo = {
      process: child,
      cardId,
      branchDir,
      status: 'idle',
      restartCount: 0,
    };

    this.workers.set(cardId, workerInfo);

    // Forward worker stdout/stderr to main process console
    child.stdout?.on('data', (data: Buffer) => {
      console.log(`[Worker:${cardId}] ${data.toString().trim()}`);
    });
    child.stderr?.on('data', (data: Buffer) => {
      console.error(`[Worker:${cardId}] ${data.toString().trim()}`);
    });

    // Handle IPC messages from worker
    child.on('message', (msg: WorkerEvent) => {
      if (msg.type === 'status') {
        workerInfo.status = msg.status as 'idle' | 'running' | 'error';
        if (msg.error) workerInfo.lastError = msg.error;
      }
      // Emit event so WebSocket handler can forward to clients
      this.emit('worker:event', cardId, msg);
    });

    // Handle worker exit
    child.on('exit', (code, signal) => {
      console.log(
        `[ProcessManager] Worker ${cardId} exited: code=${code}, signal=${signal}`
      );
      this.workers.delete(cardId);

      // Auto-restart on unexpected exit (not from graceful shutdown)
      if (
        code !== 0 &&
        signal !== 'SIGTERM' &&
        workerInfo.restartCount < config.maxWorkerRestarts
      ) {
        console.log(
          `[ProcessManager] Restarting worker ${cardId} (attempt ${workerInfo.restartCount + 1})`
        );
        setTimeout(() => {
          if (!this.workers.has(cardId)) {
            const restarted = this.spawnWorker(cardId, branchDir);
            if (restarted) {
              const newInfo = this.workers.get(cardId);
              if (newInfo) {
                newInfo.restartCount = workerInfo.restartCount + 1;
              }
            }
          }
        }, config.workerRestartDelay);
      }

      this.emit('worker:exit', cardId, code);
    });

    child.on('error', (err) => {
      console.error(`[ProcessManager] Worker ${cardId} error:`, err.message);
      workerInfo.status = 'error';
      workerInfo.lastError = err.message;
      this.emit('worker:event', cardId, {
        type: 'status',
        status: 'error',
        error: err.message,
      });
    });

    console.log(`[ProcessManager] Spawned worker for card ${cardId} at ${branchDir}`);
    return true;
  }

  sendInstruction(cardId: string, message: string, context?: { description: string; comments: Array<{ author: string; body: string; created_at: string }> }): boolean {
    const worker = this.workers.get(cardId);
    if (!worker) {
      console.warn(`[ProcessManager] No worker for card ${cardId}`);
      return false;
    }
    worker.process.send({ type: 'chat:send', message, context });
    return true;
  }

  abortWorker(cardId: string): boolean {
    const worker = this.workers.get(cardId);
    if (!worker) return false;
    worker.process.send({ type: 'chat:abort' });
    return true;
  }

  async killWorker(cardId: string): Promise<void> {
    const worker = this.workers.get(cardId);
    if (!worker) return;

    // Send graceful shutdown
    try {
      worker.process.send({ type: 'shutdown' });
    } catch {
      // Process may already be dead
    }

    // Force kill after timeout
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (this.workers.has(cardId)) {
          worker.process.kill('SIGKILL');
          this.workers.delete(cardId);
        }
        resolve();
      }, 5000);

      worker.process.on('exit', () => {
        clearTimeout(timeout);
        this.workers.delete(cardId);
        resolve();
      });
    });
  }

  async killAll(): Promise<void> {
    const killPromises = Array.from(this.workers.keys()).map((cardId) =>
      this.killWorker(cardId)
    );
    await Promise.all(killPromises);
  }

  hasWorker(cardId: string): boolean {
    return this.workers.has(cardId);
  }
}

export const processManager = new ProcessManager();
