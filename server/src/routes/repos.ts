import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { RepoService } from '../services/RepoService.js';
import { gitService } from '../services/GitService.js';
import { param } from '../utils/params.js';

const router = Router();

// GET /api/repos
router.get('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    const repos = RepoService.getAll();
    res.json(repos);
  } catch (err) {
    next(err);
  }
});

// GET /api/repos/:id
router.get('/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = RepoService.getById(param(req, 'id'));
    if (!repo) {
      res.status(404).json({ error: 'Repo not found' });
      return;
    }
    res.json(repo);
  } catch (err) {
    next(err);
  }
});

// POST /api/repos
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, local_path, github_owner, github_repo, github_pat_ref, default_branch } =
      req.body;
    if (!name || !local_path) {
      res.status(400).json({ error: 'name and local_path are required' });
      return;
    }
    const repo = await RepoService.create({
      name,
      local_path,
      github_owner,
      github_repo,
      github_pat_ref,
      default_branch,
    });
    res.status(201).json(repo);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/repos/:id
router.patch('/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = RepoService.update(param(req, 'id'), req.body);
    if (!repo) {
      res.status(404).json({ error: 'Repo not found' });
      return;
    }
    res.json(repo);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/repos/:id
router.delete('/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const deleted = RepoService.delete(param(req, 'id'));
    if (!deleted) {
      res.status(404).json({ error: 'Repo not found' });
      return;
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// GET /api/repos/:id/branches - list branches
router.get('/:id/branches', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = RepoService.getById(param(req, 'id')) as Record<string, unknown> | undefined;
    if (!repo) {
      res.status(404).json({ error: 'Repo not found' });
      return;
    }
    const branches = await gitService.listBranches(repo.local_path as string);
    res.json(branches);
  } catch (err) {
    next(err);
  }
});

export default router;
