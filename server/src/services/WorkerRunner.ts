/**
 * WorkerRunner — starts workers inside DevEnvironments.
 *
 * Only used for containerized worker types (CardWorker, EvalWorker).
 * PRWorker stays on fork() + IPC — it doesn't touch WorkerRunner at all.
 */

import { config } from '../config.js';
import type { DevEnvironment, RemoteProcess } from './devenv/DevEnvironment.js';

export interface WorkerStartConfig {
  cardId: string;
  apiKey?: string;
  /** Additional environment variables for the worker process */
  extraEnv?: Record<string, string>;
}

export class WorkerRunner {
  private runningProcesses = new Map<string, RemoteProcess>(); // `${cardId}:${workerType}` → process

  /**
   * Start a worker inside a DevEnvironment.
   * The worker connects back to the host server via WebSocket.
   */
  async start(
    env: DevEnvironment,
    workerType: 'card' | 'eval',
    startConfig: WorkerStartConfig,
  ): Promise<RemoteProcess> {
    const key = `${startConfig.cardId}:${workerType}`;

    // Kill existing process for this card+type if running
    const existing = this.runningProcesses.get(key);
    if (existing) {
      try {
        await existing.kill();
      } catch {
        // already exited
      }
      this.runningProcesses.delete(key);
    }

    const hostAddress = env.getHostAddress();
    const workerWsUrl = `ws://${hostAddress}:${config.port}/ws/worker`;

    const envVars: Record<string, string> = {
      WORKER_CARD_ID: startConfig.cardId,
      WORKER_TYPE: workerType,
      WORKER_BRANCH_DIR: env.workspacePath,
      WORKER_WS_URL: workerWsUrl,
      ...(startConfig.apiKey ? { ANTHROPIC_API_KEY: startConfig.apiKey } : {}),
      ...(startConfig.extraEnv || {}),
    };

    console.log(`[WorkerRunner] Starting ${workerType} worker for card ${startConfig.cardId} in environment ${env.id.slice(0, 12)}`);

    const proc = await env.spawn(
      'npx tsx /app/worker/containerEntry.ts',
      {
        cwd: env.workspacePath,
        env: envVars,
      }
    );

    this.runningProcesses.set(key, proc);

    proc.onExit((code) => {
      console.log(`[WorkerRunner] ${workerType} worker for card ${startConfig.cardId} exited with code ${code}`);
      this.runningProcesses.delete(key);
    });

    return proc;
  }

  /**
   * Kill a specific worker type for a card.
   */
  async kill(cardId: string, workerType: 'card' | 'eval'): Promise<void> {
    const key = `${cardId}:${workerType}`;
    const proc = this.runningProcesses.get(key);
    if (!proc) return;

    try {
      await proc.kill();
    } catch {
      // already exited
    }
    this.runningProcesses.delete(key);
  }

  /**
   * Kill all workers for a card.
   */
  async killAll(cardId: string): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const [key, proc] of this.runningProcesses) {
      if (key.startsWith(`${cardId}:`)) {
        promises.push(
          proc.kill().catch(() => {}).then(() => {
            this.runningProcesses.delete(key);
          })
        );
      }
    }
    await Promise.all(promises);
  }

  /**
   * Check if a worker is running for a card.
   */
  hasWorker(cardId: string, workerType: 'card' | 'eval'): boolean {
    return this.runningProcesses.has(`${cardId}:${workerType}`);
  }
}

export const workerRunner = new WorkerRunner();
