import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { processManager } from '../services/ProcessManager.js';
import { evalProcessManager } from '../services/EvalProcessManager.js';
import { prProcessManager } from '../services/PRProcessManager.js';
import { RepoService } from '../services/RepoService.js';
import { SettingsService } from '../services/SettingsService.js';
import { devEnvironmentManager } from '../services/devenv/DevEnvironmentManager.js';
import { workerRunner } from '../services/WorkerRunner.js';
import { workerWsManager } from './workerWsHandler.js';
import { db } from '../db/connection.js';
import { readSpecFile } from '../utils/specFile.js';

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
      case 'pr:create':
        handlePRCreate(ws, msg);
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

  // Check for a worker: either local (IPC) or containerized (WS)
  const hasLocalWorker = processManager.hasWorker(cardId);
  const hasContainerWorker = workerWsManager.hasWorker(cardId, 'card');

  if (!hasLocalWorker && !hasContainerWorker) {
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

  // Route to the appropriate worker
  let sent = false;
  if (hasContainerWorker) {
    sent = workerWsManager.sendToWorker(cardId, 'card', {
      type: 'chat:send',
      message: message as string,
      context,
    });
  } else {
    sent = processManager.sendInstruction(cardId, message as string, context);
  }

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

  // Send abort to whichever transport the worker is using
  if (workerWsManager.hasWorker(cardId, 'card')) {
    workerWsManager.sendToWorker(cardId, 'card', { type: 'chat:abort' });
  } else {
    processManager.abortWorker(cardId);
  }
}

function handleWorkerStatus(ws: WebSocket, msg: WsMessage): void {
  const { cardId } = msg;
  if (cardId) {
    // Check both local and containerized workers
    const localStatus = processManager.getWorkerStatus(cardId);
    const hasContainer = workerWsManager.hasWorker(cardId, 'card');
    const status = localStatus !== 'none' ? localStatus : (hasContainer ? 'idle' : 'none');
    ws.send(JSON.stringify({ type: 'worker:status', cardId, status }));
  } else {
    const statuses = processManager.getAllWorkerStatuses();
    ws.send(JSON.stringify({ type: 'worker:statuses', statuses }));
  }
}

async function handleEvalRun(ws: WebSocket, msg: WsMessage): Promise<void> {
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

  // If a DevEnvironment exists for this card, start eval worker inside it
  const env = devEnvironmentManager.getEnvironment(cardId);
  if (env && env.status === 'ready') {
    try {
      await workerRunner.start(env, 'eval', { cardId });
      // The eval worker will connect via WS and receive its context from the host
      // We still need to send the eval context through the WS connection once it registers
      // For now, use local eval process manager as the eval context assembly is coupled there
      // TODO: Decouple eval context assembly from EvalProcessManager in future iteration
      const started = evalProcessManager.runEval(cardId, branchDir);
      if (!started) {
        ws.send(JSON.stringify({ type: 'eval:error', cardId, error: 'Failed to start evaluation' }));
      }
      return;
    } catch (err) {
      console.warn(`[ChatHandler] Failed to start eval in DevEnvironment, falling back to local:`, err);
    }
  }

  const started = evalProcessManager.runEval(cardId, branchDir);
  if (!started) {
    ws.send(
      JSON.stringify({ type: 'eval:error', cardId, error: 'Failed to start evaluation' })
    );
  }
}

async function handlePRCreate(ws: WebSocket, msg: WsMessage): Promise<void> {
  const { cardId } = msg;
  if (!cardId) {
    ws.send(JSON.stringify({ type: 'error', error: 'cardId required' }));
    return;
  }

  // Gather card + repo info
  const card = db
    .prepare('SELECT id, branch_name, branch_dir, repo_id, pr_number, pr_state FROM cards WHERE id = ?')
    .get(cardId) as { id: string; branch_name: string | null; branch_dir: string | null; repo_id: string | null; pr_number: number | null; pr_state: string | null } | undefined;

  if (!card) {
    ws.send(JSON.stringify({ type: 'pr:error', cardId, error: 'Card not found' }));
    return;
  }

  if (!card.branch_name) {
    ws.send(JSON.stringify({ type: 'pr:error', cardId, error: 'Card has no branch' }));
    return;
  }

  if (!card.repo_id) {
    ws.send(JSON.stringify({ type: 'pr:error', cardId, error: 'Card has no linked repo' }));
    return;
  }

  const repo = RepoService.getById(card.repo_id);
  if (!repo) {
    ws.send(JSON.stringify({ type: 'pr:error', cardId, error: 'Repo not found' }));
    return;
  }

  // Auto-detect GitHub info if missing
  let githubOwner = repo.github_owner;
  let githubRepo = repo.github_repo;
  if (!githubOwner || !githubRepo) {
    await RepoService.detectAndUpdateGitHub(repo.id, repo.local_path);
    const updated = RepoService.getById(repo.id);
    githubOwner = updated?.github_owner ?? null;
    githubRepo = updated?.github_repo ?? null;
  }

  if (!githubOwner || !githubRepo) {
    ws.send(JSON.stringify({ type: 'pr:error', cardId, error: 'Repo has no GitHub remote configured' }));
    return;
  }

  const pat = SettingsService.get('github_pat');
  if (!pat) {
    ws.send(JSON.stringify({ type: 'pr:error', cardId, error: 'GitHub PAT not configured in settings' }));
    return;
  }

  const branchDir = card.branch_dir || repo.local_path;

  // Determine mode based on PR state machine:
  //   no PR              → create
  //   PR open            → update (commit + push)
  //   PR closed/merged   → create new PR (old one is done)
  const prIsActive = card.pr_number && card.pr_state === 'open';
  const mode = prIsActive ? 'update' : 'create';
  const title = (msg.title as string) || card.branch_name;
  const body = (msg.body as string) || '';

  const started = prProcessManager.createPR({
    cardId,
    branchDir,
    branchName: card.branch_name,
    baseBranch: repo.default_branch,
    githubOwner,
    githubRepo,
    pat,
    title,
    body,
    mode,
    prNumber: card.pr_number ?? undefined,
  } as import('../services/PRProcessManager.js').PRContext);

  if (!started) {
    ws.send(JSON.stringify({ type: 'pr:error', cardId, error: 'Failed to start PR worker' }));
  }
}

function buildCardContext(cardId: string): CardContext {
  const card = db.prepare('SELECT description FROM cards WHERE id = ?').get(cardId) as
    | { description: string }
    | undefined;

  const specFromFile = readSpecFile(cardId);

  const comments = db
    .prepare('SELECT author, body, created_at FROM card_comments WHERE card_id = ? ORDER BY created_at ASC')
    .all(cardId) as Array<{ author: string; body: string; created_at: string }>;

  return {
    description: specFromFile ?? card?.description ?? '',
    comments,
  };
}
