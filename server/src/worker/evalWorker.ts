/**
 * Eval Worker - runs a one-shot Claude evaluation session.
 * Reads eval criteria, runs verification, and writes results to a markdown file.
 *
 * Communication with host via WorkerTransport (IPC when fork()-ed, WebSocket in containers).
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { ClaudeRunner } from './claudeRunner.js';
import { createTransport, type WorkerTransport } from './transport.js';

interface WorkerConfig {
  cardId: string;
  branchDir: string;
}

interface EvalContext {
  cardId: string;
  evalEnvSetup: string;
  evalVerification: string;
  envSubtasks: Array<{ title: string; completed: number }>;
  verifySubtasks: Array<{ title: string; completed: number }>;
  resultFilePath: string;
}

type MainToEvalWorker =
  | { type: 'eval:start'; context: EvalContext }
  | { type: 'shutdown' };

const transport: WorkerTransport = createTransport();

function send(msg: Record<string, unknown>): void {
  transport.send(msg);
}

const config: WorkerConfig = {
  cardId: process.env.WORKER_CARD_ID!,
  branchDir: process.env.WORKER_BRANCH_DIR!,
};

if (!config.cardId || !config.branchDir) {
  console.error('[EvalWorker] Missing required config environment variables');
  process.exit(1);
}

const claudeRunner = new ClaudeRunner({ cwd: config.branchDir, cardId: `eval-${config.cardId}` });

// Handle messages from host (via IPC or WebSocket)
transport.onMessage = (msg: Record<string, unknown>) => {
  const typed = msg as unknown as MainToEvalWorker;
  switch (typed.type) {
    case 'eval:start':
      handleEvalStart(typed.context);
      break;
    case 'shutdown':
      handleShutdown();
      break;
  }
};

function buildEvalPrompt(ctx: EvalContext): string {
  const parts: string[] = [];

  parts.push('You are an evaluation agent. Your job is to verify whether the implementation in this codebase meets the specified criteria.');
  parts.push('You must follow the environment setup steps, then verify each criterion, and report PASS or FAIL with evidence.');
  parts.push(`Write your complete evaluation results as a markdown file to: ${ctx.resultFilePath}`);

  if (ctx.evalEnvSetup.trim()) {
    parts.push(`\n## Environment Setup Instructions\n${ctx.evalEnvSetup.trim()}`);
  }

  if (ctx.envSubtasks.length > 0) {
    parts.push('\n## Setup Steps (Action Items)');
    for (const st of ctx.envSubtasks) {
      parts.push(`- ${st.title}`);
    }
  }

  if (ctx.evalVerification.trim()) {
    parts.push(`\n## Verification Criteria\n${ctx.evalVerification.trim()}`);
  }

  if (ctx.verifySubtasks.length > 0) {
    parts.push('\n## Verification Checklist');
    for (const st of ctx.verifySubtasks) {
      parts.push(`- [ ] ${st.title}`);
    }
  }

  parts.push('\n## Output Format');
  parts.push('Write a markdown file with:');
  parts.push('1. A summary section with overall PASS/FAIL');
  parts.push('2. For each verification item: PASS/FAIL status with evidence (code snippets, test output, etc.)');
  parts.push('3. Any issues or recommendations found during evaluation');
  parts.push(`\nWrite the result file to: ${ctx.resultFilePath}`);

  return parts.join('\n');
}

async function handleEvalStart(context: EvalContext): Promise<void> {
  if (claudeRunner.isRunning) {
    send({ type: 'eval:error', error: 'Eval session already running' });
    return;
  }

  send({ type: 'eval:status', status: 'running' });

  // Ensure result directory exists
  const dir = path.dirname(context.resultFilePath);
  fs.mkdirSync(dir, { recursive: true });

  const prompt = buildEvalPrompt(context);

  await claudeRunner.run(prompt, null, (event) => {
    switch (event.type) {
      case 'system_init':
        send({ type: 'eval:system_init', sessionId: event.sessionId, model: event.model, tools: event.tools });
        break;
      case 'token':
        send({ type: 'eval:token', text: event.text });
        break;
      case 'assistant_text':
        send({ type: 'eval:assistant_text', text: event.text });
        break;
      case 'tool_use':
        send({ type: 'eval:tool_use', name: event.name, input: event.input, toolUseId: event.toolUseId });
        break;
      case 'tool_result':
        send({ type: 'eval:tool_result', name: event.name, result: event.result, toolUseId: event.toolUseId });
        break;
      case 'result_stats':
        send({ type: 'eval:result_stats', costUsd: event.costUsd, numTurns: event.numTurns, durationMs: event.durationMs });
        break;
      case 'message_complete': {
        // Check if result file was written
        const filename = path.basename(context.resultFilePath);
        const fileExists = fs.existsSync(context.resultFilePath);
        send({
          type: 'eval:complete',
          filename,
          resultFilePath: context.resultFilePath,
          fileWritten: fileExists,
          summary: fileExists ? 'Evaluation complete — result file written' : 'Evaluation complete — no result file found',
        });
        send({ type: 'eval:status', status: 'complete' });
        // Clean up and exit (one-shot)
        gracefulExit(0);
        break;
      }
      case 'error':
        send({ type: 'eval:error', error: event.error });
        send({ type: 'eval:status', status: 'error' });
        gracefulExit(1);
        break;
      case 'exit':
        break;
    }
  });
}

/**
 * Kill all child processes spawned by this worker (Claude SDK sessions, Bash tools, etc.),
 * then exit cleanly.
 */
function gracefulExit(code: number): void {
  // Abort any running Claude session first
  if (claudeRunner.isRunning) {
    claudeRunner.abort();
  }
  // Kill any child processes we spawned
  killOwnChildren();
  transport.close();
  setTimeout(() => process.exit(code), 1000);
}

function killOwnChildren(): void {
  try {
    execSync(`pkill -TERM -P ${process.pid} 2>/dev/null || true`, { timeout: 2000 });
  } catch {
    // already exited — fine
  }
}

function handleShutdown(): void {
  if (claudeRunner.isRunning) {
    claudeRunner.abort();
  }
  killOwnChildren();
  send({ type: 'eval:status', status: 'complete' });
  transport.close();
  setTimeout(() => process.exit(0), 1000);
}

// Signal ready
send({ type: 'eval:ready' });

process.on('uncaughtException', (err) => {
  console.error('[EvalWorker] Uncaught exception:', err);
  send({ type: 'eval:error', error: err.message });
  send({ type: 'eval:status', status: 'error' });
});

process.on('unhandledRejection', (err) => {
  console.error('[EvalWorker] Unhandled rejection:', err);
});
