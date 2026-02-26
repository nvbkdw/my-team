/**
 * Card Worker - manages a Claude Code session and file watching
 * for a single card's worktree directory.
 *
 * Communication with host via WorkerTransport (IPC when fork()-ed, WebSocket in containers).
 */

import { ClaudeRunner } from './claudeRunner.js';
import { FileWatcher } from './fileWatcher.js';
import { TraceLogger } from '../utils/traceLogger.js';
import { createTransport, type WorkerTransport } from './transport.js';

interface WorkerConfig {
  cardId: string;
  branchDir: string;
}

interface CardContext {
  description: string;
  comments: Array<{ author: string; body: string; created_at: string }>;
}

type MainToWorker =
  | { type: 'chat:send'; message: string; context?: CardContext }
  | { type: 'chat:abort' }
  | { type: 'config:update'; config: Partial<WorkerConfig> }
  | { type: 'eval:result'; cardId: string; filename: string; summary: string; resultFilePath: string }
  | { type: 'shutdown' };

const transport: WorkerTransport = createTransport();

function send(msg: Record<string, unknown>): void {
  transport.send(msg);
}

// Get config from environment variables passed during fork
const config: WorkerConfig = {
  cardId: process.env.WORKER_CARD_ID!,
  branchDir: process.env.WORKER_BRANCH_DIR!,
};

if (!config.cardId || !config.branchDir) {
  console.error('[CardWorker] Missing required config environment variables');
  process.exit(1);
}

// SDK session ID for multi-turn conversation (captured from system.init)
let sdkSessionId: string | null = null;

// Create a single ClaudeRunner instance, reused across messages
const claudeRunner = new ClaudeRunner({ cwd: config.branchDir, cardId: config.cardId });
const traceLogger = new TraceLogger(config.cardId);

// Set up file watcher
const fileWatcher = new FileWatcher(config.branchDir, (files) => {
  traceLogger.logFilesChanged(files);
  send({ type: 'files:changed', files });
});
fileWatcher.start();

// Handle messages from host (via IPC or WebSocket)
transport.onMessage = (msg: Record<string, unknown>) => {
  const typed = msg as unknown as MainToWorker;
  switch (typed.type) {
    case 'chat:send':
      handleChatSend(typed.message, typed.context);
      break;
    case 'chat:abort':
      handleChatAbort();
      break;
    case 'config:update':
      Object.assign(config, typed.config);
      break;
    case 'eval:result':
      console.log(`[CardWorker] Eval completed for card ${typed.cardId}: ${typed.summary}`);
      console.log(`[CardWorker] Eval result file: ${typed.resultFilePath}`);
      break;
    case 'shutdown':
      handleShutdown();
      break;
  }
};

function buildContextPrompt(message: string, context: CardContext): string {
  const parts: string[] = [];

  if (context.description.trim()) {
    parts.push(`Feature specification:\n${context.description.trim()}`);
  }

  if (context.comments.length > 0) {
    const commentLines = context.comments.map(
      (c) => `[${c.author}] ${c.body}`
    );
    parts.push(`Design and implementation details:\n${commentLines.join('\n')}`);
  }

  parts.push(`User request:\n${message}`);

  return parts.join('\n\n');
}

async function handleChatSend(message: string, context?: CardContext): Promise<void> {
  if (claudeRunner.isRunning) {
    send({ type: 'chat:error', error: 'A Claude session is already running' });
    return;
  }

  send({ type: 'status', status: 'running' });
  traceLogger.logStatusChange('running');

  // On first message (new session), inject card context into the prompt.
  // On resumed sessions, Claude already has the prior context.
  const prompt = !sdkSessionId && context
    ? buildContextPrompt(message, context)
    : message;

  traceLogger.logRunStart(message);

  await claudeRunner.run(prompt, sdkSessionId, (event) => {
    switch (event.type) {
      case 'token':
        send({ type: 'chat:token', text: event.text });
        break;
      case 'system_init':
        traceLogger.logSystemInit(event.sessionId, event.model, event.tools);
        send({ type: 'chat:system_init', sessionId: event.sessionId, model: event.model, tools: event.tools });
        break;
      case 'assistant_text':
        traceLogger.logAssistantText(event.text);
        send({ type: 'chat:assistant_text', text: event.text });
        break;
      case 'tool_use':
        traceLogger.logToolUse(event.name, event.toolUseId, event.input);
        send({ type: 'chat:tool_use', name: event.name, input: event.input, toolUseId: event.toolUseId });
        break;
      case 'tool_result':
        traceLogger.logToolResult(event.name, event.toolUseId, event.result);
        send({ type: 'chat:tool_result', name: event.name, result: event.result, toolUseId: event.toolUseId });
        break;
      case 'result_stats':
        traceLogger.logRunEnd(event.costUsd, event.numTurns, event.durationMs);
        send({ type: 'chat:result_stats', costUsd: event.costUsd, numTurns: event.numTurns, durationMs: event.durationMs });
        break;
      case 'message_complete':
        // Capture session ID for multi-turn resume
        if (event.sessionId) {
          sdkSessionId = event.sessionId;
        }
        send({
          type: 'chat:message_complete',
          content: event.content,
          costUsd: event.costUsd,
        });
        send({ type: 'status', status: 'idle' });
        traceLogger.logStatusChange('idle');
        break;
      case 'error':
        traceLogger.logError(event.error);
        send({ type: 'chat:error', error: event.error });
        send({ type: 'status', status: 'error', error: event.error });
        traceLogger.logStatusChange('error');
        break;
      case 'exit':
        // Already handled by message_complete
        break;
    }
  });
}

function handleChatAbort(): void {
  if (claudeRunner.isRunning) {
    claudeRunner.abort();
    traceLogger.logAbort();
    traceLogger.logStatusChange('idle');
    send({ type: 'status', status: 'idle' });
  }
}

function handleShutdown(): void {
  if (claudeRunner.isRunning) {
    claudeRunner.abort();
  }
  fileWatcher.stop();
  traceLogger.close();
  send({ type: 'status', status: 'idle' });
  transport.close();
  setTimeout(() => process.exit(0), 500);
}

// Signal ready
send({ type: 'ready' });
send({ type: 'status', status: 'idle' });

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  console.error('[CardWorker] Uncaught exception:', err);
  send({ type: 'status', status: 'error', error: err.message });
});

process.on('unhandledRejection', (err) => {
  console.error('[CardWorker] Unhandled rejection:', err);
});
