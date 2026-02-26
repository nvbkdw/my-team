import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { CardService } from '../services/CardService.js';
import { gitService } from '../services/GitService.js';
import { githubService } from '../services/GitHubService.js';
import { SettingsService as settingsService } from '../services/SettingsService.js';
import { processManager } from '../services/ProcessManager.js';
import { db } from '../db/connection.js';
import { param } from '../utils/params.js';
import subtasksRouter from './subtasks.js';

const router = Router();

/**
 * Perform cleanup when a card is closed/done:
 * kill worker, remove worktree, close PR. Each step is best-effort.
 */
async function performCardCleanup(card: Record<string, unknown>): Promise<{ branch_dir?: null; pr_state?: string }> {
  const updates: { branch_dir?: null; pr_state?: string } = {};

  // 1. Kill worker if running
  try {
    await processManager.killWorker(card.id as string);
  } catch (err) {
    console.warn(`[Cards] Failed to kill worker for card ${card.id}:`, err);
  }

  // 2. Remove worktree if card has branch_name and repo_id
  if (card.branch_name && card.repo_id) {
    try {
      const repo = db.prepare('SELECT local_path FROM repos WHERE id = ?').get(card.repo_id as string) as { local_path: string } | undefined;
      if (repo) {
        await gitService.removeWorktree(repo.local_path, card.branch_name as string);
        updates.branch_dir = null;
      }
    } catch (err) {
      console.warn(`[Cards] Failed to remove worktree for card ${card.id}:`, err);
    }
  }

  // 3. Close PR if open
  if (card.pr_number && card.pr_state === 'open') {
    try {
      const pat = settingsService.get('github_pat');
      if (pat && card.repo_id) {
        const repo = db.prepare('SELECT github_owner, github_repo FROM repos WHERE id = ?')
          .get(card.repo_id as string) as { github_owner: string; github_repo: string } | undefined;
        if (repo?.github_owner && repo?.github_repo) {
          await githubService.closePR(pat, repo.github_owner, repo.github_repo, card.pr_number as number);
          updates.pr_state = 'closed';
        }
      }
    } catch (err) {
      console.warn(`[Cards] Failed to close PR for card ${card.id}:`, err);
    }
  }

  return updates;
}

// GET /api/cards - list all cards
router.get('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    const cards = CardService.getAll();
    res.json(cards);
  } catch (err) {
    next(err);
  }
});

// GET /api/cards/:id - get single card
router.get('/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const card = CardService.getById(param(req, 'id'));
    if (!card) {
      res.status(404).json({ error: 'Card not found' });
      return;
    }
    res.json(card);
  } catch (err) {
    next(err);
  }
});

// POST /api/cards - create card
router.post('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, description, repo_id, status } = req.body;
    if (!title || typeof title !== 'string') {
      res.status(400).json({ error: 'title is required' });
      return;
    }
    const card = CardService.create({ title, description, repo_id, status });
    res.status(201).json(card);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/cards/:id - update card
router.patch('/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const card = CardService.update(param(req, 'id'), req.body);
    if (!card) {
      res.status(404).json({ error: 'Card not found' });
      return;
    }
    res.json(card);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/cards/:id/move - move card to new status/position
router.patch('/:id/move', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, position } = req.body;
    if (!status || position === undefined) {
      res.status(400).json({ error: 'status and position are required' });
      return;
    }

    const oldCard = CardService.getById(param(req, 'id'));
    const card = CardService.move(param(req, 'id'), status, position);
    if (!card) {
      res.status(404).json({ error: 'Card not found' });
      return;
    }

    // Worker lifecycle management based on status transitions
    if (oldCard && oldCard.status !== status) {
      if (status === 'in_progress') {
        // Spawn worker when moving to in_progress
        // Use branch_dir if available, otherwise fall back to repo path or cwd
        let workerDir = card.branch_dir;
        if (!workerDir && card.repo_id) {
          const repo = db.prepare('SELECT local_path FROM repos WHERE id = ?').get(card.repo_id) as { local_path: string } | undefined;
          if (repo) workerDir = repo.local_path;
        }
        if (!workerDir) workerDir = process.cwd();

        console.log(`[Cards] Spawning worker for card ${card.id}, dir: ${workerDir}`);
        processManager.spawnWorker(card.id, workerDir);
      } else if (oldCard.status === 'in_progress') {
        // Kill worker when moving out of in_progress
        console.log(`[Cards] Killing worker for card ${card.id}`);
        await processManager.killWorker(card.id);
      }

      // Auto-cleanup when moving to done: remove worktree + close PR
      if (status === 'done') {
        const cleanupUpdates = await performCardCleanup(oldCard as unknown as Record<string, unknown>);
        if (Object.keys(cleanupUpdates).length > 0) {
          const refreshed = CardService.update(card.id, cleanupUpdates);
          if (refreshed) {
            res.json(refreshed);
            return;
          }
        }
      }
    }

    res.json(card);
  } catch (err) {
    next(err);
  }
});

// POST /api/cards/:id/close - close card (cleanup worktree, PR, move to done)
router.post('/:id/close', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const card = CardService.getById(param(req, 'id')) as Record<string, unknown> | undefined;
    if (!card) {
      res.status(404).json({ error: 'Card not found' });
      return;
    }

    const cleanupUpdates = await performCardCleanup(card);

    const updated = CardService.update(param(req, 'id'), {
      status: 'done',
      ...cleanupUpdates,
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/cards/:id
router.delete('/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const deleted = CardService.delete(param(req, 'id'));
    if (!deleted) {
      res.status(404).json({ error: 'Card not found' });
      return;
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// === Comments ===

// GET /api/cards/:id/comments
router.get('/:id/comments', (req: Request, res: Response, next: NextFunction) => {
  try {
    const comments = db
      .prepare('SELECT * FROM card_comments WHERE card_id = ? ORDER BY created_at ASC')
      .all(param(req, 'id'));
    res.json(comments);
  } catch (err) {
    next(err);
  }
});

// POST /api/cards/:id/comments
router.post('/:id/comments', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { author, body } = req.body;
    if (!body) {
      res.status(400).json({ error: 'body is required' });
      return;
    }
    const id = uuidv4();
    db.prepare(
      'INSERT INTO card_comments (id, card_id, author, body) VALUES (?, ?, ?, ?)'
    ).run(id, param(req, 'id'), author || 'user', body);
    const comment = db.prepare('SELECT * FROM card_comments WHERE id = ?').get(id);
    res.status(201).json(comment);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/cards/:id/comments/:commentId
router.delete(
  '/:id/comments/:commentId',
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = db
        .prepare('DELETE FROM card_comments WHERE id = ? AND card_id = ?')
        .run(param(req, 'commentId'), param(req, 'id'));
      if (result.changes === 0) {
        res.status(404).json({ error: 'Comment not found' });
        return;
      }
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

// === Labels ===

// GET /api/cards/:id/labels
router.get('/:id/labels', (req: Request, res: Response, next: NextFunction) => {
  try {
    const labels = db
      .prepare('SELECT * FROM card_labels WHERE card_id = ?')
      .all(param(req, 'id'));
    res.json(labels);
  } catch (err) {
    next(err);
  }
});

// POST /api/cards/:id/labels
router.post('/:id/labels', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { label, color } = req.body;
    if (!label) {
      res.status(400).json({ error: 'label is required' });
      return;
    }
    const id = uuidv4();
    db.prepare(
      'INSERT INTO card_labels (id, card_id, label, color) VALUES (?, ?, ?, ?)'
    ).run(id, param(req, 'id'), label, color || '#6366f1');
    const result = db.prepare('SELECT * FROM card_labels WHERE id = ?').get(id);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/cards/:id/labels/:labelId
router.delete(
  '/:id/labels/:labelId',
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = db
        .prepare('DELETE FROM card_labels WHERE id = ? AND card_id = ?')
        .run(param(req, 'labelId'), param(req, 'id'));
      if (result.changes === 0) {
        res.status(404).json({ error: 'Label not found' });
        return;
      }
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

// === Branch operations ===

// POST /api/cards/:id/branch - create branch and worktree
router.post('/:id/branch', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const card = CardService.getById(param(req, 'id')) as Record<string, unknown> | undefined;
    if (!card) {
      res.status(404).json({ error: 'Card not found' });
      return;
    }
    if (!card.repo_id) {
      res.status(400).json({ error: 'Card has no linked repo' });
      return;
    }

    const repo = db.prepare('SELECT * FROM repos WHERE id = ?').get(card.repo_id as string) as
      | { local_path: string; default_branch: string }
      | undefined;
    if (!repo) {
      res.status(404).json({ error: 'Repo not found' });
      return;
    }

    const { branch_name } = req.body;
    if (!branch_name) {
      res.status(400).json({ error: 'branch_name is required' });
      return;
    }

    const branchDir = await gitService.createWorktree(
      repo.local_path,
      branch_name,
      repo.default_branch
    );

    const updated = CardService.update(param(req, 'id'), {
      branch_name,
      branch_dir: branchDir,
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// GET /api/cards/:id/git/status - get git status of card's worktree
router.get('/:id/git/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const card = CardService.getById(param(req, 'id')) as Record<string, unknown> | undefined;
    if (!card?.branch_dir) {
      res.status(404).json({ error: 'Card has no branch directory' });
      return;
    }
    const status = await gitService.getStatus(card.branch_dir as string);
    res.json(status);
  } catch (err) {
    next(err);
  }
});

// GET /api/cards/:id/git/log - get git log of card's worktree
router.get('/:id/git/log', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const card = CardService.getById(param(req, 'id')) as Record<string, unknown> | undefined;
    if (!card?.branch_dir) {
      res.status(404).json({ error: 'Card has no branch directory' });
      return;
    }
    const limit = parseInt(req.query.limit as string) || 20;
    const log = await gitService.getLog(card.branch_dir as string, limit);
    res.json(log);
  } catch (err) {
    next(err);
  }
});

// GET /api/cards/:id/git/diff - get git diff of card's worktree
router.get('/:id/git/diff', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const card = CardService.getById(param(req, 'id')) as Record<string, unknown> | undefined;
    if (!card?.branch_dir) {
      res.status(404).json({ error: 'Card has no branch directory' });
      return;
    }
    const diff = await gitService.getDiff(card.branch_dir as string);
    res.json({ diff });
  } catch (err) {
    next(err);
  }
});

// GET /api/cards/:id/git/branch-diff - get diff against base branch
router.get('/:id/git/branch-diff', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const card = CardService.getById(param(req, 'id')) as Record<string, unknown> | undefined;
    if (!card?.branch_dir) {
      res.status(404).json({ error: 'Card has no branch directory' });
      return;
    }

    // Resolve the base branch from the repo's default_branch
    let baseBranch = 'main';
    if (card.repo_id) {
      const repo = db.prepare('SELECT default_branch FROM repos WHERE id = ?')
        .get(card.repo_id as string) as { default_branch: string } | undefined;
      if (repo?.default_branch) {
        baseBranch = repo.default_branch;
      }
    }

    const result = await gitService.diffAgainstBase(card.branch_dir as string, baseBranch);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// === Subtasks (nested router) ===
router.use('/:id/subtasks', subtasksRouter);

export default router;
