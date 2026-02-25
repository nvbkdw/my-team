import { Router } from 'express';
import cardsRouter from './cards.js';
import reposRouter from './repos.js';
import settingsRouter from './settings.js';
import filesRouter from './files.js';
import prRouter from './pr.js';
import ideRouter from './ide.js';
import devserverRouter from './devserver.js';
import tracesRouter from './traces.js';

const router = Router();

router.use('/api/cards', cardsRouter);
router.use('/api/repos', reposRouter);
router.use('/api/settings', settingsRouter);
router.use('/api', filesRouter);
router.use('/api', prRouter);
router.use('/api', ideRouter);
router.use('/api', devserverRouter);
router.use('/api', tracesRouter);

export default router;
