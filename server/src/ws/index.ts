import { Server as HttpServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { processManager } from '../services/ProcessManager.js';
import { devServerManager } from '../services/DevServerManager.js';
import { evalProcessManager } from '../services/EvalProcessManager.js';
import { prProcessManager } from '../services/PRProcessManager.js';
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

    // Send current dev server statuses on connect
    const devStatuses = devServerManager.getAllServerStatuses();
    if (Object.keys(devStatuses).length > 0) {
      ws.send(JSON.stringify({ type: 'devserver:statuses', statuses: devStatuses }));
    }

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

  // Bridge DevServerManager events to all connected WebSocket clients
  devServerManager.on('devserver:event', (cardId: string, event: Record<string, unknown>) => {
    const message = JSON.stringify({ ...event, cardId });
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  });

  devServerManager.on('devserver:exit', (cardId: string, code: number) => {
    const message = JSON.stringify({ type: 'devserver:exit', cardId, code });
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  });

  // Bridge EvalProcessManager events to all connected WebSocket clients
  evalProcessManager.on('eval:event', (cardId: string, event: Record<string, unknown>) => {
    const message = JSON.stringify({ ...event, cardId });
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  });

  evalProcessManager.on('eval:exit', (cardId: string, code: number) => {
    const message = JSON.stringify({ type: 'eval:exit', cardId, code });
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  });

  // Bridge PRProcessManager events to all connected WebSocket clients
  prProcessManager.on('pr:event', (cardId: string, event: Record<string, unknown>) => {
    // When PR is complete, update the card in the DB
    if (event.type === 'pr:complete' && event.pr) {
      const pr = event.pr as { number: number; html_url: string; state: string };
      db.prepare(
        'UPDATE cards SET pr_number = ?, pr_url = ?, pr_state = ?, updated_at = datetime(\'now\') WHERE id = ?'
      ).run(pr.number, pr.html_url, pr.state, cardId);
    }

    const message = JSON.stringify({ ...event, cardId });
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  });

  prProcessManager.on('pr:exit', (cardId: string, code: number) => {
    const message = JSON.stringify({ type: 'pr:exit', cardId, code });
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  });

  console.log('[WS] WebSocket server ready at /ws');
  return wss;
}
