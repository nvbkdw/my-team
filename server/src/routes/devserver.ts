import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { CardService } from '../services/CardService.js';
import { devServerManager } from '../services/DevServerManager.js';
import { param } from '../utils/params.js';

const router = Router();

// POST /api/cards/:id/devserver/start
router.post('/cards/:id/devserver/start', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const card = CardService.getById(param(req, 'id')) as Record<string, unknown> | undefined;
    if (!card) {
      res.status(404).json({ error: 'Card not found' });
      return;
    }
    if (!card.branch_dir) {
      res.status(400).json({ error: 'Card has no branch directory' });
      return;
    }

    const { command } = req.body ?? {};
    const result = await devServerManager.startServer(
      card.id as string,
      card.branch_dir as string,
      command,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/cards/:id/devserver/stop
router.post('/cards/:id/devserver/stop', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await devServerManager.stopServer(param(req, 'id'));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/cards/:id/devserver/status
router.get('/cards/:id/devserver/status', (req: Request, res: Response, next: NextFunction) => {
  try {
    const info = devServerManager.getServerInfo(param(req, 'id'));
    res.json(info);
  } catch (err) {
    next(err);
  }
});

export default router;
