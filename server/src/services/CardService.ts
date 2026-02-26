import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/connection.js';

export interface Card {
  id: string;
  repo_id: string | null;
  title: string;
  description: string;
  status: 'backlog' | 'priority' | 'in_progress' | 'done';
  branch_name: string | null;
  branch_dir: string | null;
  pr_number: number | null;
  pr_url: string | null;
  pr_state: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface CreateCardData {
  title: string;
  description?: string;
  repo_id?: string;
  status?: Card['status'];
}

export interface UpdateCardData {
  title?: string;
  description?: string;
  eval_env_setup?: string;
  eval_verification?: string;
  repo_id?: string | null;
  status?: Card['status'];
  branch_name?: string | null;
  branch_dir?: string | null;
  pr_number?: number | null;
  pr_url?: string | null;
  pr_state?: string | null;
  position?: number;
}

export const CardService = {
  getAll(): Card[] {
    const stmt = db.prepare('SELECT * FROM cards ORDER BY position ASC');
    return stmt.all() as Card[];
  },

  getByStatus(status: string): Card[] {
    const stmt = db.prepare('SELECT * FROM cards WHERE status = ? ORDER BY position ASC');
    return stmt.all(status) as Card[];
  },

  getById(id: string): Card | undefined {
    const stmt = db.prepare('SELECT * FROM cards WHERE id = ?');
    return stmt.get(id) as Card | undefined;
  },

  create(data: CreateCardData): Card {
    const id = uuidv4();
    const status = data.status ?? 'backlog';

    const maxPosRow = db
      .prepare('SELECT COALESCE(MAX(position), 0) as maxPos FROM cards WHERE status = ?')
      .get(status) as { maxPos: number };
    const position = maxPosRow.maxPos + 1;

    const stmt = db.prepare(`
      INSERT INTO cards (id, title, description, repo_id, status, position)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, data.title, data.description ?? '', data.repo_id ?? null, status, position);

    return CardService.getById(id)!;
  },

  update(id: string, data: UpdateCardData): Card | undefined {
    const existing = CardService.getById(id);
    if (!existing) return undefined;

    const fields: string[] = [];
    const values: unknown[] = [];

    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (fields.length === 0) return existing;

    fields.push("updated_at = datetime('now')");
    values.push(id);

    const stmt = db.prepare(`UPDATE cards SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);

    return CardService.getById(id);
  },

  move(id: string, newStatus: string, newPosition: number): Card | undefined {
    const existing = CardService.getById(id);
    if (!existing) return undefined;

    const stmt = db.prepare(`
      UPDATE cards SET status = ?, position = ?, updated_at = datetime('now') WHERE id = ?
    `);
    stmt.run(newStatus, newPosition, id);

    return CardService.getById(id);
  },

  reorder(id: string, newPosition: number): Card | undefined {
    const existing = CardService.getById(id);
    if (!existing) return undefined;

    const stmt = db.prepare(`
      UPDATE cards SET position = ?, updated_at = datetime('now') WHERE id = ?
    `);
    stmt.run(newPosition, id);

    return CardService.getById(id);
  },

  delete(id: string): boolean {
    const stmt = db.prepare('DELETE FROM cards WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  },
};
