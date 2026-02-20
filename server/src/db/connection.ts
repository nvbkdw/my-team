import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { config } from '../config.js';

let instance: DatabaseType | null = null;

export function getDb(): DatabaseType {
  if (!instance) {
    instance = new Database(config.dbPath);
    instance.pragma('journal_mode = WAL');
    instance.pragma('foreign_keys = ON');
  }
  return instance;
}

export const db: DatabaseType = getDb();
