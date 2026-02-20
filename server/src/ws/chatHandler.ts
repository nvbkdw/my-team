import { WebSocket } from 'ws';
import { processManager } from '../services/ProcessManager.js';

interface WsMessage {
  type: string;
  cardId?: string;
  message?: string;
  [key: string]: unknown;
}

/**
 * Handles WebSocket messages related to chat and worker interactions.
 * Bridges WebSocket <-> ProcessManager <-> Card Workers.
 */
export function setupChatHandler(ws: WebSocket): void {
  ws.on('message', (data) => {
    let msg: WsMessage;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      ws.send(JSON.stringify({ type: 'error', error: 'Invalid JSON' }));
      return;
    }

    switch (msg.type) {
      case 'chat:send':
        handleChatSend(ws, msg);
        break;
      case 'chat:abort':
        handleChatAbort(ws, msg);
        break;
      case 'worker:status':
        handleWorkerStatus(ws, msg);
        break;
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }));
        break;
      default:
        ws.send(
          JSON.stringify({ type: 'error', error: `Unknown message type: ${msg.type}` })
        );
    }
  });
}

function handleChatSend(ws: WebSocket, msg: WsMessage): void {
  const { cardId, message } = msg;
  if (!cardId || !message) {
    ws.send(JSON.stringify({ type: 'error', error: 'cardId and message required' }));
    return;
  }

  if (!processManager.hasWorker(cardId)) {
    ws.send(
      JSON.stringify({
        type: 'chat:error',
        cardId,
        error: 'No worker running for this card. Move card to "In Progress" first.',
      })
    );
    return;
  }

  const sent = processManager.sendInstruction(cardId, message as string);
  if (!sent) {
    ws.send(
      JSON.stringify({ type: 'chat:error', cardId, error: 'Failed to send message to worker' })
    );
  }
}

function handleChatAbort(ws: WebSocket, msg: WsMessage): void {
  const { cardId } = msg;
  if (!cardId) {
    ws.send(JSON.stringify({ type: 'error', error: 'cardId required' }));
    return;
  }
  processManager.abortWorker(cardId);
}

function handleWorkerStatus(ws: WebSocket, msg: WsMessage): void {
  const { cardId } = msg;
  if (cardId) {
    const status = processManager.getWorkerStatus(cardId);
    ws.send(JSON.stringify({ type: 'worker:status', cardId, status }));
  } else {
    const statuses = processManager.getAllWorkerStatuses();
    ws.send(JSON.stringify({ type: 'worker:statuses', statuses }));
  }
}
