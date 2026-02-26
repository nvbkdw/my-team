import { createServer } from 'node:http';
import app from './app.js';
import { config } from './config.js';
import { initializeDatabase } from './db/schema.js';
import { setupWebSocket } from './ws/index.js';
import { processManager } from './services/ProcessManager.js';
import { devServerManager } from './services/DevServerManager.js';
import { evalProcessManager } from './services/EvalProcessManager.js';
import { prProcessManager } from './services/PRProcessManager.js';
import { devEnvironmentManager } from './services/devenv/DevEnvironmentManager.js';
import { db } from './db/connection.js';

initializeDatabase();

const server = createServer(app);
setupWebSocket(server);

server.listen(config.port, async () => {
  console.log(`Server running on http://localhost:${config.port}`);

  // Re-spawn workers for all in_progress cards
  const inProgressCards = db
    .prepare('SELECT c.id, c.branch_dir, c.repo_id, r.local_path as repo_path FROM cards c LEFT JOIN repos r ON c.repo_id = r.id WHERE c.status = ?')
    .all('in_progress') as Array<{ id: string; branch_dir: string | null; repo_id: string | null; repo_path: string | null }>;

  // Clean up orphan DevEnvironment containers (from previous server crash)
  if (devEnvironmentManager.isEnabled) {
    const activeCardIds = new Set(inProgressCards.map((c) => c.id));
    await devEnvironmentManager.cleanupOrphans(activeCardIds);
  }

  for (const card of inProgressCards) {
    const workerDir = card.branch_dir || card.repo_path || process.cwd();
    const repoPath = card.repo_path || workerDir;

    // Re-provision DevEnvironment if Docker mode is enabled
    if (devEnvironmentManager.isEnabled) {
      try {
        await devEnvironmentManager.provision(card.id, repoPath, workerDir);
        console.log(`[Startup] Provisioned DevEnvironment for card ${card.id}`);
      } catch (err) {
        console.error(`[Startup] Failed to provision DevEnvironment for card ${card.id}:`, err);
      }
    }

    console.log(`[Startup] Spawning worker for in_progress card ${card.id}, dir: ${workerDir}`);
    processManager.spawnWorker(card.id, workerDir);
  }

  if (inProgressCards.length > 0) {
    console.log(`[Startup] Spawned ${inProgressCards.length} workers for in_progress cards`);
  }
});

// Graceful shutdown
async function gracefulShutdown(): Promise<void> {
  console.log('Shutting down...');
  await Promise.all([
    processManager.killAll(),
    devServerManager.stopAll(),
    evalProcessManager.killAll(),
    prProcessManager.killAll(),
    devEnvironmentManager.destroyAll(),
  ]);
  server.close();
  process.exit(0);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
