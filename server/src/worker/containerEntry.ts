/**
 * containerEntry.ts — entry point for workers running inside a DevEnvironment.
 *
 * Reads env vars to determine worker type, then imports and runs the
 * appropriate worker module. The worker auto-selects WsTransport (via
 * WORKER_WS_URL env var) to communicate back to the host server.
 *
 * Env vars expected:
 *   WORKER_TYPE       - 'card' | 'eval'
 *   WORKER_CARD_ID    - card ID
 *   WORKER_BRANCH_DIR - workspace path inside the container
 *   WORKER_WS_URL     - WebSocket URL to connect back to host server
 *   ANTHROPIC_API_KEY  - (optional, may be inherited from image)
 */

export {}; // Ensure this file is treated as a module for top-level await

const workerType = process.env.WORKER_TYPE;
const cardId = process.env.WORKER_CARD_ID;

if (!workerType || !cardId) {
  console.error('[containerEntry] Missing WORKER_TYPE or WORKER_CARD_ID');
  process.exit(1);
}

console.log(`[containerEntry] Starting ${workerType} worker for card ${cardId}`);

// Dynamic import of the appropriate worker module.
// Each worker calls createTransport() internally, which will use WsTransport
// because WORKER_WS_URL is set.
switch (workerType) {
  case 'card':
    await import('./cardWorker.js');
    break;
  case 'eval':
    await import('./evalWorker.js');
    break;
  default:
    console.error(`[containerEntry] Unknown worker type: ${workerType}`);
    process.exit(1);
}
