import { Router, Request, Response, NextFunction } from 'express';
import { fileService } from '../services/FileService.js';
import { db } from '../db/connection.js';
import { param } from '../utils/params.js';

const router = Router();

// GET /api/cards/:cardId/files - get file tree for card's worktree
router.get('/cards/:cardId/files', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const card = db.prepare('SELECT branch_dir FROM cards WHERE id = ?').get(param(req, 'cardId')) as
      | { branch_dir: string | null }
      | undefined;

    if (!card?.branch_dir) {
      res.status(404).json({ error: 'Card has no branch directory' });
      return;
    }

    const tree = await fileService.getDirectoryTree(card.branch_dir);
    res.json(tree);
  } catch (err) {
    next(err);
  }
});

// GET /api/cards/:cardId/files/read?path=... - read file content
router.get(
  '/cards/:cardId/files/read',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const card = db.prepare('SELECT branch_dir FROM cards WHERE id = ?').get(
        param(req, 'cardId')
      ) as { branch_dir: string | null } | undefined;

      if (!card?.branch_dir) {
        res.status(404).json({ error: 'Card has no branch directory' });
        return;
      }

      const filePath = req.query.path as string;
      if (!filePath) {
        res.status(400).json({ error: 'path query parameter required' });
        return;
      }

      const content = await fileService.readFile(card.branch_dir, filePath);
      res.json({ path: filePath, content });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/cards/:cardId/files/write - write file content
router.put(
  '/cards/:cardId/files/write',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const card = db.prepare('SELECT branch_dir FROM cards WHERE id = ?').get(
        param(req, 'cardId')
      ) as { branch_dir: string | null } | undefined;

      if (!card?.branch_dir) {
        res.status(404).json({ error: 'Card has no branch directory' });
        return;
      }

      const { path: filePath, content } = req.body;
      if (!filePath || content === undefined) {
        res.status(400).json({ error: 'path and content required' });
        return;
      }

      await fileService.writeFile(card.branch_dir, filePath, content);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
