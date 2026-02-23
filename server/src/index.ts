import { createServer } from 'node:http';
import app from './app.js';
import { config } from './config.js';
import { initializeDatabase } from './db/schema.js';
import { setupWebSocket } from './ws/index.js';
import { processManager } from './services/ProcessManager.js';
import { devServerManager } from './services/DevServerManager.js';
import { db } from './db/connection.js';

initializeDatabase();

const server = createServer(app);
setupWebSocket(server);

server.listen(config.port, () => {
  console.log(`Server running on http://localhost:${config.port}`);

  // Re-spawn workers for all in_progress cards
  const inProgressCards = db
    .prepare('SELECT c.id, c.branch_dir, c.repo_id, r.local_path as repo_path FROM cards c LEFT JOIN repos r ON c.repo_id = r.id WHERE c.status = ?')
    .all('in_progress') as Array<{ id: string; branch_dir: string | null; repo_id: string | null; repo_path: string | null }>;

  for (const card of inProgressCards) {
    const workerDir = card.branch_dir || card.repo_path || process.cwd();
    console.log(`[Startup] Spawning worker for in_progress card ${card.id}, dir: ${workerDir}`);
    processManager.spawnWorker(card.id, workerDir);
  }

  if (inProgressCards.length > 0) {
    console.log(`[Startup] Spawned ${inProgressCards.length} workers for in_progress cards`);
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  await Promise.all([processManager.killAll(), devServerManager.stopAll()]);
  server.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Shutting down...');
  await Promise.all([processManager.killAll(), devServerManager.stopAll()]);
  server.close();
  process.exit(0);
});
