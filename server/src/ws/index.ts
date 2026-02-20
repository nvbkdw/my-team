import { Server as HttpServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { processManager } from '../services/ProcessManager.js';
import { db } from '../db/connection.js';
import { setupChatHandler } from './chatHandler.js';

export function setupWebSocket(server: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws' });

  const clients = new Set<WebSocket>();

  wss.on('connection', (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    console.log(`[WS] Client connected from ${clientIp}, total clients: ${clients.size + 1}`);
    clients.add(ws);

    setupChatHandler(ws);

    // Send current worker statuses on connect
    const statuses = processManager.getAllWorkerStatuses();
    const initMsg = JSON.stringify({ type: 'worker:statuses', statuses });
    console.log('[WS] Sending initial statuses:', initMsg);
    ws.send(initMsg);

    ws.on('close', (code, reason) => {
      console.log(`[WS] Client disconnected, code: ${code}, reason: ${reason.toString()}, remaining: ${clients.size - 1}`);
      clients.delete(ws);
    });

    ws.on('error', (err) => {
      console.error('[WS] Client socket error:', err.message);
      clients.delete(ws);
    });
  });

  wss.on('error', (err) => {
    console.error('[WS] Server error:', err.message);
  });

  // Bridge ProcessManager events to all connected WebSocket clients
  processManager.on('worker:event', (cardId: string, event: Record<string, unknown>) => {
    // Persist Claude's complete response as a card comment
    if (event.type === 'chat:message_complete' && event.content) {
      const commentId = uuidv4();
      db.prepare(
        'INSERT INTO card_comments (id, card_id, author, body) VALUES (?, ?, ?, ?)'
      ).run(commentId, cardId, 'claude', event.content as string);
    }

    const message = JSON.stringify({ ...event, cardId });
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  });

  processManager.on('worker:exit', (cardId: string, code: number) => {
    const message = JSON.stringify({
      type: 'worker:exit',
      cardId,
      code,
    });
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  });

  console.log('[WS] WebSocket server ready at /ws');
  return wss;
}
