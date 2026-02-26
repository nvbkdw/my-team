import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { SubtaskService } from '../services/SubtaskService.js';
import { param } from '../utils/params.js';

const router = Router({ mergeParams: true });

// GET /api/cards/:id/subtasks?section=spec
router.get('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    const section = req.query.section as string | undefined;
    const subtasks = SubtaskService.getByCardId(param(req, 'id'), section);
    res.json(subtasks);
  } catch (err) {
    next(err);
  }
});

// POST /api/cards/:id/subtasks
router.post('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, parent_id, section } = req.body;
    if (!title || typeof title !== 'string') {
      res.status(400).json({ error: 'title is required' });
      return;
    }
    const subtask = SubtaskService.create({
      card_id: param(req, 'id'),
      parent_id: parent_id || null,
      title,
      section: section || undefined,
    });
    res.status(201).json(subtask);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/cards/:id/subtasks/:subtaskId
router.patch('/:subtaskId', (req: Request, res: Response, next: NextFunction) => {
  try {
    const subtask = SubtaskService.update(param(req, 'subtaskId'), req.body);
    if (!subtask) {
      res.status(404).json({ error: 'Subtask not found' });
      return;
    }
    res.json(subtask);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/cards/:id/subtasks/:subtaskId
router.delete('/:subtaskId', (req: Request, res: Response, next: NextFunction) => {
  try {
    const deleted = SubtaskService.delete(param(req, 'subtaskId'));
    if (!deleted) {
      res.status(404).json({ error: 'Subtask not found' });
      return;
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
