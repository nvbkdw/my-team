/**
 * PR Worker - forked child process that handles git commit, push, and GitHub PR creation/update.
 * Uses Claude AI to generate commit messages from diffs and PR summaries from commit logs.
 * Writes traces to the card's trace log for history panel visibility.
 *
 * Two modes:
 * - 'create': commit + push + create new PR
 * - 'update': commit + push to update existing PR
 *
 * Communication with main process via Node IPC (process.send / process.on('message'))
 */

import simpleGit from 'simple-git';
import { Octokit } from '@octokit/rest';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { TraceLogger } from '../utils/traceLogger.js';

interface PRContext {
  cardId: string;
  branchDir: string;
  branchName: string;
  baseBranch: string;
  githubOwner: string;
  githubRepo: string;
  pat: string;
  title: string;
  body: string;
  mode: 'create' | 'update';
  prNumber?: number;
}

type MainToPRWorker =
  | { type: 'pr:start'; context: PRContext }
  | { type: 'shutdown' };

function send(msg: unknown): void {
  if (process.send) {
    process.send(msg);
  }
}

const cardId = process.env.WORKER_CARD_ID!;
const branchDir = process.env.WORKER_BRANCH_DIR!;

if (!cardId || !branchDir) {
  console.error('[PRWorker] Missing required config environment variables');
  process.exit(1);
}

const traceLogger = new TraceLogger(cardId);

process.on('message', (msg: MainToPRWorker) => {
  switch (msg.type) {
    case 'pr:start':
      handlePRStart(msg.context);
      break;
    case 'shutdown':
      traceLogger.close();
      setTimeout(() => process.exit(0), 500);
      break;
  }
});

// ── AI text generation ───────────────────────────────────

const MAX_DIFF_LEN = 15_000;
const MAX_LOG_LEN = 8_000;

/**
 * Use the Claude Agent SDK to generate text from a prompt.
 * Single-turn, no tools — purely text generation.
 */
async function generateText(prompt: string): Promise<string> {
  const { CLAUDECODE, CLAUDE_CODE_SSE_PORT, CLAUDE_CODE_ENTRYPOINT, ...cleanEnv } = process.env;

  let result = '';
  const stream = query({
    prompt,
    options: {
      cwd: branchDir,
      maxTurns: 1,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      abortController: new AbortController(),
      env: cleanEnv as Record<string, string>,
    },
  });

  for await (const msg of stream) {
    if (msg.type === 'assistant') {
      const content = msg.message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text' && block.text) {
            result += block.text;
          }
        }
      }
    }
  }

  return result.trim();
}

function truncateForPrompt(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + '\n...[truncated]';
}

async function generateCommitMessage(diff: string): Promise<string> {
  const prompt = `You are a commit message generator. Given the following git diff, write a single concise conventional commit message (e.g. "feat: ...", "fix: ...", "refactor: ...").

Rules:
- One line only, no body
- Max 72 characters
- Use conventional commit format (feat/fix/refactor/docs/style/test/chore)
- Focus on WHAT changed and WHY, not HOW
- Do NOT wrap in quotes or backticks
- Output ONLY the commit message, nothing else

Diff:
${truncateForPrompt(diff, MAX_DIFF_LEN)}`;

  try {
    sendStep('summarizing', 'AI generating commit message...');
    traceLogger.logAssistantText('Generating commit message with AI');
    const msg = await generateText(prompt);
    // Extract first line, strip any quotes/backticks
    const firstLine = msg.split('\n')[0].replace(/^["'`]+|["'`]+$/g, '').trim();
    traceLogger.logAssistantText(`AI commit message: "${firstLine}"`);
    return firstLine || 'chore: update files';
  } catch (err) {
    traceLogger.logAssistantText(`AI commit message failed, using fallback: ${(err as Error).message}`);
    return 'chore: update files';
  }
}

async function generatePRSummary(
  branchName: string,
  commitLog: string,
  fullDiff: string,
): Promise<{ title: string; body: string }> {
  const prompt = `You are a pull request summary generator. Given a branch name, commit history, and the full diff, generate a PR title and body.

Rules:
- Title: concise, max 72 characters, no conventional commit prefix
- Body: markdown format with a "## Summary" section containing 2-5 bullet points describing the key changes, and a "## Changes" section with a brief list of what was modified
- Focus on the user-facing impact and purpose of the changes
- Output format (exactly):
TITLE: <title here>
BODY:
<body here>

Branch: ${branchName}

Commits:
${truncateForPrompt(commitLog, MAX_LOG_LEN)}

Diff:
${truncateForPrompt(fullDiff, MAX_DIFF_LEN)}`;

  try {
    sendStep('summarizing', 'AI generating PR summary...');
    traceLogger.logAssistantText('Generating PR summary with AI');
    const result = await generateText(prompt);

    // Parse TITLE: and BODY: from the response
    const titleMatch = result.match(/^TITLE:\s*(.+)/m);
    const bodyMatch = result.match(/^BODY:\s*\n?([\s\S]+)/m);

    const title = titleMatch?.[1]?.trim() || branchName;
    const body = bodyMatch?.[1]?.trim() || '';

    traceLogger.logAssistantText(`AI PR title: "${title}"`);
    return { title, body };
  } catch (err) {
    traceLogger.logAssistantText(`AI PR summary failed, using fallback: ${(err as Error).message}`);
    return { title: branchName, body: '' };
  }
}

// ── Main handler ─────────────────────────────────────────

async function handlePRStart(ctx: PRContext): Promise<void> {
  const isUpdate = ctx.mode === 'update';
  const actionLabel = isUpdate ? 'PR update' : 'PR creation';

  send({ type: 'pr:status', status: 'running' });
  traceLogger.logRunStart(actionLabel);
  traceLogger.logStatusChange('running');

  // Augment PATH so git hooks can find binaries (pnpm, next, etc.)
  const extraPaths = [
    path.join(ctx.branchDir, 'node_modules', '.bin'),
    '/usr/local/bin',
    '/opt/homebrew/bin',
    `${process.env.HOME}/.local/bin`,
    `${process.env.HOME}/.npm-global/bin`,
    `${process.env.HOME}/Library/pnpm`,
    `${process.env.HOME}/.bun/bin`,
  ].filter(Boolean);
  const augmentedPath = [...extraPaths, process.env.PATH || ''].join(':');

  const git = simpleGit(ctx.branchDir).env('PATH', augmentedPath);

  try {
    // Step 1: Check for uncommitted changes
    sendStep('checking', 'Checking for uncommitted changes...');
    const status = await git.status();
    const hasChanges = status.modified.length > 0 ||
      status.not_added.length > 0 ||
      status.deleted.length > 0 ||
      status.created.length > 0 ||
      status.staged.length > 0;

    // Step 2: Ensure dependencies are installed (needed for pre-commit hooks)
    await ensureDependencies(ctx.branchDir);

    // Step 3: Stage and commit if there are changes
    if (hasChanges) {
      sendStep('staging', `Staging ${status.files.length} file(s)...`);
      traceLogger.logAssistantText(`Staging ${status.files.length} changed file(s)`);
      await git.add('.');

      // Get the staged diff for AI commit message generation
      const stagedDiff = await git.diff(['--cached']);
      const commitMsg = await generateCommitMessage(stagedDiff);

      sendStep('committing', 'Committing changes...');
      await git.commit(commitMsg);
      traceLogger.logAssistantText(`Committed: "${commitMsg}"`);
    } else {
      sendStep('checking', 'No uncommitted changes found');
      traceLogger.logAssistantText('No uncommitted changes found');
    }

    // Step 4: For create mode, check there are commits ahead of base
    if (!isUpdate) {
      try {
        const log = await git.log([`${ctx.baseBranch}..HEAD`]);
        if (log.total === 0) {
          throw new Error(`No commits between ${ctx.baseBranch} and ${ctx.branchName}. Make some changes first.`);
        }
        traceLogger.logAssistantText(`${log.total} commit(s) ahead of ${ctx.baseBranch}`);
      } catch (err) {
        if ((err as Error).message.includes('unknown revision')) {
          const log = await git.log([`origin/${ctx.baseBranch}..HEAD`]);
          if (log.total === 0) {
            throw new Error(`No commits between origin/${ctx.baseBranch} and ${ctx.branchName}. Make some changes first.`);
          }
          traceLogger.logAssistantText(`${log.total} commit(s) ahead of origin/${ctx.baseBranch}`);
        } else {
          throw err;
        }
      }
    }

    // Step 5: Push branch to remote
    sendStep('pushing', `Pushing ${ctx.branchName} to origin...`);
    traceLogger.logAssistantText(`Pushing branch ${ctx.branchName} to origin`);
    await git.push('origin', ctx.branchName, ['--set-upstream']);

    if (isUpdate) {
      // Update mode: just commit + push, PR already exists
      traceLogger.logAssistantText(`Pushed updates to PR #${ctx.prNumber}`);
      traceLogger.logRunEnd(0, 0, 0);
      traceLogger.logStatusChange('idle');

      send({
        type: 'pr:updated',
        prNumber: ctx.prNumber,
        message: `Pushed new commits to PR #${ctx.prNumber}`,
      });
      send({ type: 'pr:status', status: 'complete' });
    } else {
      // Create mode: generate AI summary, then create PR via GitHub API
      // Gather commit log and full diff for summary generation
      let commitLog = '';
      let fullDiff = '';
      try {
        const log = await git.log([`${ctx.baseBranch}..HEAD`]);
        commitLog = log.all.map((c) => `${c.hash.slice(0, 7)} ${c.message}`).join('\n');
      } catch {
        try {
          const log = await git.log([`origin/${ctx.baseBranch}..HEAD`]);
          commitLog = log.all.map((c) => `${c.hash.slice(0, 7)} ${c.message}`).join('\n');
        } catch { /* proceed without commit log */ }
      }
      try {
        fullDiff = await git.diff([`origin/${ctx.baseBranch}...HEAD`]);
      } catch {
        try {
          fullDiff = await git.diff([`${ctx.baseBranch}...HEAD`]);
        } catch { /* proceed without diff */ }
      }

      const { title: prTitle, body: prBody } = await generatePRSummary(
        ctx.branchName,
        commitLog,
        fullDiff,
      );

      sendStep('creating_pr', 'Creating pull request on GitHub...');
      traceLogger.logAssistantText('Creating pull request on GitHub');
      const octokit = new Octokit({ auth: ctx.pat });
      const { data: pr } = await octokit.pulls.create({
        owner: ctx.githubOwner,
        repo: ctx.githubRepo,
        head: ctx.branchName,
        base: ctx.baseBranch,
        title: prTitle,
        body: prBody,
      });

      traceLogger.logAssistantText(`PR #${pr.number} created: ${pr.html_url}`);
      traceLogger.logRunEnd(0, 0, 0);
      traceLogger.logStatusChange('idle');

      send({
        type: 'pr:complete',
        pr: {
          number: pr.number,
          title: pr.title,
          body: pr.body || '',
          state: pr.state,
          html_url: pr.html_url,
          head: { ref: pr.head.ref },
          base: { ref: pr.base.ref },
          user: { login: pr.user?.login || '', avatar_url: pr.user?.avatar_url || '' },
          created_at: pr.created_at,
          updated_at: pr.updated_at,
          merged_at: pr.merged_at,
          additions: pr.additions,
          deletions: pr.deletions,
          changed_files: pr.changed_files,
        },
      });
      send({ type: 'pr:status', status: 'complete' });
    }
  } catch (err) {
    const message = (err as Error).message || 'Unknown error';
    console.error('[PRWorker] Error:', message);
    traceLogger.logError(message);
    traceLogger.logStatusChange('error');
    send({ type: 'pr:error', error: message });
    send({ type: 'pr:status', status: 'error' });
  } finally {
    traceLogger.close();
    setTimeout(() => process.exit(0), 1000);
  }
}

// ── Helpers ──────────────────────────────────────────────

/**
 * Detect the package manager and install dependencies if node_modules is missing.
 * Critical for worktrees where node_modules is not shared with the main repo.
 */
async function ensureDependencies(dir: string): Promise<void> {
  const pkgJsonPath = path.join(dir, 'package.json');
  const nodeModulesPath = path.join(dir, 'node_modules');

  if (!fs.existsSync(pkgJsonPath)) return;
  if (fs.existsSync(nodeModulesPath)) return;

  let pm = 'npm';
  let installCmd = 'npm install';
  if (fs.existsSync(path.join(dir, 'pnpm-lock.yaml'))) {
    pm = 'pnpm';
    installCmd = 'pnpm install --frozen-lockfile';
  } else if (fs.existsSync(path.join(dir, 'yarn.lock'))) {
    pm = 'yarn';
    installCmd = 'yarn install --frozen-lockfile';
  } else if (fs.existsSync(path.join(dir, 'bun.lockb')) || fs.existsSync(path.join(dir, 'bun.lock'))) {
    pm = 'bun';
    installCmd = 'bun install --frozen-lockfile';
  } else if (fs.existsSync(path.join(dir, 'package-lock.json'))) {
    installCmd = 'npm ci';
  }

  sendStep('installing', `Installing dependencies with ${pm}...`);
  traceLogger.logAssistantText(`Installing dependencies with ${pm} (node_modules missing)`);

  try {
    const extraPaths = [
      path.join(dir, 'node_modules', '.bin'),
      '/usr/local/bin',
      '/opt/homebrew/bin',
      `${process.env.HOME}/.local/bin`,
      `${process.env.HOME}/.npm-global/bin`,
      `${process.env.HOME}/Library/pnpm`,
      `${process.env.HOME}/.bun/bin`,
    ].filter(Boolean);
    const envPath = [...extraPaths, process.env.PATH || ''].join(':');

    execSync(installCmd, {
      cwd: dir,
      stdio: 'pipe',
      timeout: 120_000,
      env: { ...process.env, PATH: envPath },
    });
    traceLogger.logAssistantText('Dependencies installed successfully');
  } catch (err) {
    const msg = (err as Error).message || 'Unknown install error';
    traceLogger.logAssistantText(`Warning: dependency install failed: ${msg}`);
  }
}

function sendStep(step: string, message: string): void {
  send({ type: 'pr:step', step, message });
}

// Signal ready
send({ type: 'pr:ready' });

process.on('uncaughtException', (err) => {
  console.error('[PRWorker] Uncaught exception:', err);
  send({ type: 'pr:error', error: err.message });
  send({ type: 'pr:status', status: 'error' });
});

process.on('unhandledRejection', (err) => {
  console.error('[PRWorker] Unhandled rejection:', err);
});
