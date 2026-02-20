import { Router, Request, Response, NextFunction } from 'express';
import { exec } from 'node:child_process';
import { db } from '../db/connection.js';
import { param } from '../utils/params.js';

const router = Router();

// POST /api/cards/:cardId/ide/open - open card's worktree in Cursor IDE
router.post(
  '/cards/:cardId/ide/open',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const card = db.prepare('SELECT branch_dir FROM cards WHERE id = ?').get(
        param(req, 'cardId')
      ) as { branch_dir: string | null } | undefined;

      if (!card?.branch_dir) {
        res.status(404).json({ error: 'Card has no branch directory' });
        return;
      }

      const ide = (req.query.ide as string) || 'cursor';
      const command = `${ide} "${card.branch_dir}"`;

      exec(command, (err) => {
        if (err) {
          res.status(500).json({ error: `Failed to open IDE: ${err.message}` });
          return;
        }
        res.json({ success: true, command });
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
