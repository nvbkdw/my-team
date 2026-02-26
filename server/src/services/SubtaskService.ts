import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/connection.js';

export interface Subtask {
  id: string;
  card_id: string;
  parent_id: string | null;
  title: string;
  completed: number;
  position: number;
  section: string;
  created_at: string;
  updated_at: string;
}

export interface CreateSubtaskData {
  card_id: string;
  parent_id?: string | null;
  title: string;
  section?: string;
}

export interface UpdateSubtaskData {
  title?: string;
  completed?: number;
  position?: number;
}

export const SubtaskService = {
  getByCardId(cardId: string, section?: string): Subtask[] {
    if (section) {
      const stmt = db.prepare(
        'SELECT * FROM card_subtasks WHERE card_id = ? AND section = ? ORDER BY position ASC'
      );
      return stmt.all(cardId, section) as Subtask[];
    }
    const stmt = db.prepare(
      'SELECT * FROM card_subtasks WHERE card_id = ? ORDER BY position ASC'
    );
    return stmt.all(cardId) as Subtask[];
  },

  getById(id: string): Subtask | undefined {
    const stmt = db.prepare('SELECT * FROM card_subtasks WHERE id = ?');
    return stmt.get(id) as Subtask | undefined;
  },

  create(data: CreateSubtaskData): Subtask {
    const id = uuidv4();
    const parentId = data.parent_id ?? null;

    const maxPosRow = db
      .prepare(
        parentId
          ? 'SELECT COALESCE(MAX(position), 0) as maxPos FROM card_subtasks WHERE card_id = ? AND parent_id = ?'
          : 'SELECT COALESCE(MAX(position), 0) as maxPos FROM card_subtasks WHERE card_id = ? AND parent_id IS NULL'
      )
      .get(...(parentId ? [data.card_id, parentId] : [data.card_id])) as { maxPos: number };

    const position = maxPosRow.maxPos + 1;

    const section = data.section ?? 'spec';

    db.prepare(
      'INSERT INTO card_subtasks (id, card_id, parent_id, title, position, section) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, data.card_id, parentId, data.title, position, section);

    return SubtaskService.getById(id)!;
  },

  update(id: string, data: UpdateSubtaskData): Subtask | undefined {
    const existing = SubtaskService.getById(id);
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

    db.prepare(`UPDATE card_subtasks SET ${fields.join(', ')} WHERE id = ?`).run(
      ...values
    );

    return SubtaskService.getById(id);
  },

  delete(id: string): boolean {
    const result = db.prepare('DELETE FROM card_subtasks WHERE id = ?').run(id);
    return result.changes > 0;
  },
};
