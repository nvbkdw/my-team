import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/connection.js';
import { param } from '../utils/params.js';

const router = Router();

interface ChatSession {
  id: string;
  card_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface ChatMessage {
  id: number;
  session_id: string;
  role: string;
  content: string;
  cost_usd: number | null;
  created_at: string;
}

// GET /api/cards/:cardId/chat/sessions - list sessions for a card
router.get(
  '/cards/:cardId/chat/sessions',
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const stmt = db.prepare(
        'SELECT * FROM chat_sessions WHERE card_id = ? ORDER BY updated_at DESC',
      );
      const sessions = stmt.all(param(req, 'cardId')) as ChatSession[];
      res.json(sessions);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/cards/:cardId/chat/sessions - create a new session
router.post(
  '/cards/:cardId/chat/sessions',
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = uuidv4();
      const cardId = param(req, 'cardId');
      const title = req.body?.title ?? 'Chat';

      // Verify the card exists
      const card = db.prepare('SELECT id FROM cards WHERE id = ?').get(cardId);
      if (!card) {
        res.status(404).json({ error: 'Card not found' });
        return;
      }

      const stmt = db.prepare(
        'INSERT INTO chat_sessions (id, card_id, title) VALUES (?, ?, ?)',
      );
      stmt.run(id, cardId, title);

      const session = db
        .prepare('SELECT * FROM chat_sessions WHERE id = ?')
        .get(id) as ChatSession;
      res.status(201).json(session);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/chat/sessions/:sessionId/messages - get messages for a session
router.get(
  '/chat/sessions/:sessionId/messages',
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const stmt = db.prepare(
        'SELECT * FROM chat_messages WHERE session_id = ? ORDER BY id ASC',
      );
      const messages = stmt.all(param(req, 'sessionId')) as ChatMessage[];
      res.json(messages);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/chat/sessions/:sessionId/messages - add a message
router.post(
  '/chat/sessions/:sessionId/messages',
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionId = param(req, 'sessionId');
      const { role, content, cost_usd } = req.body;

      if (!role || !content) {
        res.status(400).json({ error: 'role and content are required' });
        return;
      }

      // Verify the session exists
      const session = db
        .prepare('SELECT id FROM chat_sessions WHERE id = ?')
        .get(sessionId);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      const stmt = db.prepare(
        'INSERT INTO chat_messages (session_id, role, content, cost_usd) VALUES (?, ?, ?, ?)',
      );
      const result = stmt.run(sessionId, role, content, cost_usd ?? null);

      // Update session's updated_at
      db.prepare(
        "UPDATE chat_sessions SET updated_at = datetime('now') WHERE id = ?",
      ).run(sessionId);

      const message = db
        .prepare('SELECT * FROM chat_messages WHERE id = ?')
        .get(result.lastInsertRowid) as ChatMessage;
      res.status(201).json(message);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
