import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/connection.js';
import simpleGit from 'simple-git';
import fs from 'node:fs';

/**
 * Parse a GitHub owner/repo from a git remote URL.
 * Supports HTTPS (https://github.com/owner/repo.git) and
 * SSH (git@github.com:owner/repo.git) formats.
 */
function parseGitHubRemote(url: string): { owner: string; repo: string } | null {
  // HTTPS: https://github.com/owner/repo.git
  const httpsMatch = url.match(/github\.com\/([^/]+)\/([^/.]+?)(?:\.git)?$/);
  if (httpsMatch) return { owner: httpsMatch[1], repo: httpsMatch[2] };

  // SSH: git@github.com:owner/repo.git
  const sshMatch = url.match(/github\.com:([^/]+)\/([^/.]+?)(?:\.git)?$/);
  if (sshMatch) return { owner: sshMatch[1], repo: sshMatch[2] };

  return null;
}

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

    // Auto-detect github_owner and github_repo from the origin remote if not provided
    let { github_owner, github_repo } = data;
    if (!github_owner || !github_repo) {
      try {
        const remotes = await git.getRemotes(true);
        const origin = remotes.find((r) => r.name === 'origin');
        if (origin?.refs?.fetch) {
          const parsed = parseGitHubRemote(origin.refs.fetch);
          if (parsed) {
            github_owner = github_owner || parsed.owner;
            github_repo = github_repo || parsed.repo;
          }
        }
      } catch {
        // Ignore remote detection errors — fields stay null
      }
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
      github_owner ?? null,
      github_repo ?? null,
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

  /**
   * Detect GitHub owner/repo from the origin remote and persist to DB.
   * Returns true if GitHub info was found and saved.
   */
  async detectAndUpdateGitHub(id: string, localPath: string): Promise<boolean> {
    try {
      const git = simpleGit(localPath);
      const remotes = await git.getRemotes(true);
      const origin = remotes.find((r) => r.name === 'origin');
      if (!origin?.refs?.fetch) return false;

      const parsed = parseGitHubRemote(origin.refs.fetch);
      if (!parsed) return false;

      RepoService.update(id, {
        github_owner: parsed.owner,
        github_repo: parsed.repo,
      });
      return true;
    } catch {
      return false;
    }
  },
};
