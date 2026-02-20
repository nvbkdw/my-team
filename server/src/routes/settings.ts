import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { SettingsService } from '../services/SettingsService.js';
import { param } from '../utils/params.js';

const router = Router();

// GET /api/settings - get all settings
router.get('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = SettingsService.getAll();
    res.json(settings);
  } catch (err) {
    next(err);
  }
});

// GET /api/settings/:key - get single setting
router.get('/:key', (req: Request, res: Response, next: NextFunction) => {
  try {
    const value = SettingsService.get(param(req, 'key'));
    if (value === null) {
      res.status(404).json({ error: 'Setting not found' });
      return;
    }
    res.json({ key: param(req, 'key'), value });
  } catch (err) {
    next(err);
  }
});

// PUT /api/settings/:key - set a setting
router.put('/:key', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { value } = req.body;
    if (value === undefined) {
      res.status(400).json({ error: 'value is required' });
      return;
    }
    SettingsService.set(param(req, 'key'), value);
    res.json({ key: param(req, 'key'), value });
  } catch (err) {
    next(err);
  }
});

export default router;
