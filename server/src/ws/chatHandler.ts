import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { processManager } from '../services/ProcessManager.js';
import { evalProcessManager } from '../services/EvalProcessManager.js';
import { db } from '../db/connection.js';

export interface CardContext {
  description: string;
  comments: Array<{ author: string; body: string; created_at: string }>;
}

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
      case 'eval:run':
        handleEvalRun(ws, msg);
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

  // Persist user message as a card comment
  const commentId = uuidv4();
  db.prepare(
    'INSERT INTO card_comments (id, card_id, author, body) VALUES (?, ?, ?, ?)'
  ).run(commentId, cardId, 'user', message);

  // Gather card context (description + all comments) for Claude
  const context = buildCardContext(cardId);

  const sent = processManager.sendInstruction(cardId, message as string, context);
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

function handleEvalRun(ws: WebSocket, msg: WsMessage): void {
  const { cardId } = msg;
  if (!cardId) {
    ws.send(JSON.stringify({ type: 'error', error: 'cardId required' }));
    return;
  }

  // Get branch_dir from the card
  const card = db
    .prepare('SELECT branch_dir, repo_id FROM cards WHERE id = ?')
    .get(cardId) as { branch_dir: string | null; repo_id: string | null } | undefined;

  if (!card) {
    ws.send(JSON.stringify({ type: 'eval:error', cardId, error: 'Card not found' }));
    return;
  }

  let branchDir = card.branch_dir;
  if (!branchDir && card.repo_id) {
    const repo = db.prepare('SELECT local_path FROM repos WHERE id = ?').get(card.repo_id) as
      | { local_path: string }
      | undefined;
    branchDir = repo?.local_path ?? null;
  }

  if (!branchDir) {
    ws.send(
      JSON.stringify({
        type: 'eval:error',
        cardId,
        error: 'No branch directory available. Move card to "In Progress" first.',
      })
    );
    return;
  }

  const started = evalProcessManager.runEval(cardId, branchDir);
  if (!started) {
    ws.send(
      JSON.stringify({ type: 'eval:error', cardId, error: 'Failed to start evaluation' })
    );
  }
}

function buildCardContext(cardId: string): CardContext {
  const card = db.prepare('SELECT description FROM cards WHERE id = ?').get(cardId) as
    | { description: string }
    | undefined;

  const comments = db
    .prepare('SELECT author, body, created_at FROM card_comments WHERE card_id = ? ORDER BY created_at ASC')
    .all(cardId) as Array<{ author: string; body: string; created_at: string }>;

  return {
    description: card?.description ?? '',
    comments,
  };
}
