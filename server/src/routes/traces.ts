import { Router, Request, Response, NextFunction } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { param } from '../utils/params.js';

const TRACE_DIR = path.resolve(import.meta.dirname, '../../data/traces');

const router = Router();

// GET /api/cards/:cardId/traces - get trace entries for a card
router.get('/cards/:cardId/traces', (req: Request, res: Response, next: NextFunction) => {
  try {
    const cardId = param(req, 'cardId');
    const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
    const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit as string) || 500));

    const filePath = path.join(TRACE_DIR, `card-${cardId}.jsonl`);

    if (!fs.existsSync(filePath)) {
      res.json({ entries: [], total: 0, hasMore: false });
      return;
    }

    const data = fs.readFileSync(filePath, 'utf-8');
    const lines = data.trim().split('\n').filter(Boolean);

    const entries: unknown[] = [];
    for (const line of lines) {
      try {
        entries.push(JSON.parse(line));
      } catch { /* skip malformed lines */ }
    }

    const total = entries.length;
    const sliced = entries.slice(offset, offset + limit);

    res.json({
      entries: sliced,
      total,
      hasMore: offset + limit < total,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
