import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db/connection.js';
import { githubService } from '../services/GitHubService.js';
import { gitService } from '../services/GitService.js';
import { SettingsService as settingsService } from '../services/SettingsService.js';
import { RepoService } from '../services/RepoService.js';
import { param } from '../utils/params.js';

const router = Router();

interface CardRow {
  id: string;
  repo_id: string;
  branch_name: string;
  pr_number: number | null;
  pr_url: string | null;
}

interface RepoRow {
  id: string;
  local_path: string;
  github_owner: string;
  github_repo: string;
  default_branch: string;
}

function getPat(): string {
  const pat = settingsService.get('github_pat');
  if (!pat) throw Object.assign(new Error('GitHub PAT not configured'), { status: 400 });
  return pat;
}

async function getCardAndRepo(cardId: string): Promise<{ card: CardRow; repo: RepoRow }> {
  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(cardId) as CardRow | undefined;
  if (!card) throw Object.assign(new Error('Card not found'), { status: 404 });
  if (!card.repo_id) throw Object.assign(new Error('Card has no linked repo'), { status: 400 });

  let repo = db.prepare('SELECT * FROM repos WHERE id = ?').get(card.repo_id) as
    | RepoRow
    | undefined;
  if (!repo) throw Object.assign(new Error('Repo not found'), { status: 404 });

  // Auto-detect GitHub owner/repo from git remote if missing, and persist for future use
  if (!repo.github_owner || !repo.github_repo) {
    const updated = await RepoService.detectAndUpdateGitHub(repo.id, repo.local_path);
    if (updated) {
      repo = db.prepare('SELECT * FROM repos WHERE id = ?').get(repo.id) as RepoRow;
    }
    if (!repo!.github_owner || !repo!.github_repo) {
      throw Object.assign(new Error('Repo has no GitHub remote configured'), { status: 400 });
    }
    repo = repo!;
  }

  return { card, repo };
}

// POST /api/cards/:cardId/pr - create PR
router.post('/cards/:cardId/pr', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pat = getPat();
    const { card, repo } = await getCardAndRepo(param(req, 'cardId'));

    if (!card.branch_name) {
      res.status(400).json({ error: 'Card has no branch' });
      return;
    }

    // Push branch first
    await gitService.pushBranch(repo.local_path, card.branch_name);

    const { title, body } = req.body;
    const pr = await githubService.createPR(
      pat,
      repo.github_owner,
      repo.github_repo,
      card.branch_name,
      repo.default_branch,
      title || card.branch_name,
      body || ''
    );

    // Update card with PR info
    db.prepare(
      'UPDATE cards SET pr_number = ?, pr_url = ?, pr_state = ?, updated_at = datetime(\'now\') WHERE id = ?'
    ).run(pr.number, pr.html_url, pr.state, card.id);

    res.json(pr);
  } catch (err) {
    next(err);
  }
});

// GET /api/cards/:cardId/pr - get PR info
router.get('/cards/:cardId/pr', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pat = getPat();
    const { card, repo } = await getCardAndRepo(param(req, 'cardId'));

    if (!card.pr_number) {
      res.status(404).json({ error: 'Card has no PR' });
      return;
    }

    const pr = await githubService.getPR(pat, repo.github_owner, repo.github_repo, card.pr_number);

    // Update PR state in DB
    db.prepare(
      'UPDATE cards SET pr_state = ?, updated_at = datetime(\'now\') WHERE id = ?'
    ).run(pr.state, card.id);

    res.json(pr);
  } catch (err) {
    next(err);
  }
});

// GET /api/cards/:cardId/pr/files - get PR changed files
router.get(
  '/cards/:cardId/pr/files',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const pat = getPat();
      const { card, repo } = await getCardAndRepo(param(req, 'cardId'));

      if (!card.pr_number) {
        res.status(404).json({ error: 'Card has no PR' });
        return;
      }

      const files = await githubService.getPRFiles(
        pat,
        repo.github_owner,
        repo.github_repo,
        card.pr_number
      );
      res.json(files);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/cards/:cardId/pr/comments - get PR comments
router.get(
  '/cards/:cardId/pr/comments',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const pat = getPat();
      const { card, repo } = await getCardAndRepo(param(req, 'cardId'));

      if (!card.pr_number) {
        res.status(404).json({ error: 'Card has no PR' });
        return;
      }

      const comments = await githubService.getPRComments(
        pat,
        repo.github_owner,
        repo.github_repo,
        card.pr_number
      );
      res.json(comments);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
