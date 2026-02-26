import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { evalProcessManager } from '../services/EvalProcessManager.js';

const router = Router();

// GET /api/cards/:cardId/eval — list eval result files
router.get('/cards/:cardId/eval', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { cardId } = req.params;
    const evalDir = evalProcessManager.getEvalDataDir();
    const prefix = `card-${cardId}-eval-`;

    if (!fs.existsSync(evalDir)) {
      res.json([]);
      return;
    }

    const files = fs
      .readdirSync(evalDir)
      .filter((f) => f.startsWith(prefix) && f.endsWith('.md'))
      .sort()
      .reverse()
      .map((filename) => {
        const stat = fs.statSync(path.join(evalDir, filename));
        return { filename, createdAt: stat.mtime.toISOString(), size: stat.size };
      });

    res.json(files);
  } catch (err) {
    next(err);
  }
});

// GET /api/cards/:cardId/eval/:filename — get eval result content
router.get('/cards/:cardId/eval/:filename', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { cardId, filename } = req.params;

    // Validate filename belongs to this card (prevent path traversal)
    const fname = String(filename);
    if (!fname.startsWith(`card-${cardId}-eval-`) || !fname.endsWith('.md')) {
      res.status(400).json({ error: 'Invalid filename' });
      return;
    }

    const filePath = path.join(evalProcessManager.getEvalDataDir(), fname);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Eval result not found' });
      return;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    res.json({ filename, content });
  } catch (err) {
    next(err);
  }
});

export default router;
