import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/connection.js';
import simpleGit from 'simple-git';
import fs from 'node:fs';

export interface Repo {
  id: string;
  name: string;
  local_path: string;
  github_owner: string | null;
  github_repo: string | null;
  github_pat_ref: string | null;
  default_branch: string;
  created_at: string;
  updated_at: string;
}

export interface CreateRepoData {
  name: string;
  local_path: string;
  github_owner?: string;
  github_repo?: string;
  github_pat_ref?: string;
  default_branch?: string;
}

export interface UpdateRepoData {
  name?: string;
  local_path?: string;
  github_owner?: string | null;
  github_repo?: string | null;
  github_pat_ref?: string | null;
  default_branch?: string;
}

export const RepoService = {
  getAll(): Repo[] {
    const stmt = db.prepare('SELECT * FROM repos ORDER BY created_at DESC');
    return stmt.all() as Repo[];
  },

  getById(id: string): Repo | undefined {
    const stmt = db.prepare('SELECT * FROM repos WHERE id = ?');
    return stmt.get(id) as Repo | undefined;
  },

  async create(data: CreateRepoData): Promise<Repo> {
    // Validate that the local_path exists
    if (!fs.existsSync(data.local_path)) {
      throw new Error(`Path does not exist: ${data.local_path}`);
    }

    // Validate that it's a git repository
    const git = simpleGit(data.local_path);
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      throw new Error(`Path is not a git repository: ${data.local_path}`);
    }

    const id = uuidv4();
    const stmt = db.prepare(`
      INSERT INTO repos (id, name, local_path, github_owner, github_repo, github_pat_ref, default_branch)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      data.name,
      data.local_path,
      data.github_owner ?? null,
      data.github_repo ?? null,
      data.github_pat_ref ?? null,
      data.default_branch ?? 'main',
    );

    return RepoService.getById(id)!;
  },

  update(id: string, data: UpdateRepoData): Repo | undefined {
    const existing = RepoService.getById(id);
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

    const stmt = db.prepare(`UPDATE repos SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);

    return RepoService.getById(id);
  },

  delete(id: string): boolean {
    const stmt = db.prepare('DELETE FROM repos WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  },
};
