/**
 * workerWsHandler — WebSocket endpoint for workers running inside DevEnvironments.
 *
 * Workers in Docker containers connect back to ws://host:3001/ws/worker,
 * register with their cardId + workerType, then communicate using the same
 * message format as IPC. This handler bridges those messages into the existing
 * ProcessManager/EvalProcessManager event system.
 */

import { Server as HttpServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'node:events';

interface WorkerConnection {
  ws: WebSocket;
  cardId: string;
  workerType: string;
}

/**
 * Manages WebSocket connections from containerized workers.
 * Emits the same event types as ProcessManager / EvalProcessManager
 * so the main WS bridge can forward them to clients.
 */
class WorkerWsManager extends EventEmitter {
  private connections = new Map<string, WorkerConnection>(); // `${cardId}:${workerType}` → conn

  register(ws: WebSocket, cardId: string, workerType: string): void {
    const key = `${cardId}:${workerType}`;
    this.connections.set(key, { ws, cardId, workerType });
    console.log(`[WorkerWsManager] Registered ${workerType} worker for card ${cardId}`);
  }

  unregister(cardId: string, workerType: string): void {
    const key = `${cardId}:${workerType}`;
    this.connections.delete(key);
    console.log(`[WorkerWsManager] Unregistered ${workerType} worker for card ${cardId}`);
  }

  /**
   * Send a message to a specific containerized worker.
   */
  sendToWorker(cardId: string, workerType: string, msg: Record<string, unknown>): boolean {
    const key = `${cardId}:${workerType}`;
    const conn = this.connections.get(key);
    if (!conn || conn.ws.readyState !== WebSocket.OPEN) return false;
    conn.ws.send(JSON.stringify(msg));
    return true;
  }

  /**
   * Check if a containerized worker is connected.
   */
  hasWorker(cardId: string, workerType: string): boolean {
    const key = `${cardId}:${workerType}`;
    const conn = this.connections.get(key);
    return !!conn && conn.ws.readyState === WebSocket.OPEN;
  }

  getConnection(cardId: string, workerType: string): WorkerConnection | undefined {
    return this.connections.get(`${cardId}:${workerType}`);
  }
}

export const workerWsManager = new WorkerWsManager();

/**
 * Set up the /ws/worker WebSocket server for container workers.
 */
export function setupWorkerWebSocket(server: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws/worker' });

  wss.on('connection', (ws, req) => {
    console.log(`[WorkerWS] Worker connected from ${req.socket.remoteAddress}`);

    let registered = false;
    let connCardId: string | undefined;
    let connWorkerType: string | undefined;

    ws.on('message', (data) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }

      // First message must be a registration
      if (!registered) {
        if (msg.type === 'register' && msg.cardId && msg.workerType) {
          connCardId = msg.cardId as string;
          connWorkerType = msg.workerType as string;
          workerWsManager.register(ws, connCardId, connWorkerType);
          registered = true;
        } else {
          ws.close(4001, 'First message must be register');
        }
        return;
      }

      // Route worker messages to the appropriate event system.
      // The message format is identical to IPC — we just emit via workerWsManager.
      if (connWorkerType === 'card') {
        workerWsManager.emit('worker:event', connCardId, msg);
      } else if (connWorkerType === 'eval') {
        workerWsManager.emit('eval:event', connCardId, msg);

        // Auto-unregister on eval completion
        if (msg.type === 'eval:complete' || msg.type === 'eval:error') {
          setTimeout(() => {
            workerWsManager.unregister(connCardId!, connWorkerType!);
          }, 2000);
        }
      }
    });

    ws.on('close', () => {
      if (registered && connCardId && connWorkerType) {
        workerWsManager.unregister(connCardId, connWorkerType);
        // Emit exit event
        if (connWorkerType === 'card') {
          workerWsManager.emit('worker:exit', connCardId, null);
        } else if (connWorkerType === 'eval') {
          workerWsManager.emit('eval:exit', connCardId, null);
        }
      }
    });

    ws.on('error', (err) => {
      console.error(`[WorkerWS] Worker socket error:`, err.message);
    });
  });

  console.log('[WorkerWS] Worker WebSocket server ready at /ws/worker');
  return wss;
}
