import simpleGit, { SimpleGit } from 'simple-git';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

export class GitService {
  private getGit(repoPath: string): SimpleGit {
    return simpleGit(repoPath);
  }

  async isGitRepo(dirPath: string): Promise<boolean> {
    try {
      const git = this.getGit(dirPath);
      return await git.checkIsRepo();
    } catch {
      return false;
    }
  }

  async createWorktree(
    repoPath: string,
    branchName: string,
    baseBranch: string = 'main'
  ): Promise<string> {
    const git = this.getGit(repoPath);
    const worktreesDir = path.join(repoPath, '.worktrees');
    if (!existsSync(worktreesDir)) {
      mkdirSync(worktreesDir, { recursive: true });
    }

    const safeName = branchName.replace(/\//g, '-');
    const worktreeDir = path.join(worktreesDir, safeName);

    if (existsSync(worktreeDir)) {
      return worktreeDir;
    }

    // Check if branch exists
    const branches = await git.branchLocal();
    if (!branches.all.includes(branchName)) {
      await git.checkoutLocalBranch(branchName);
      await git.checkout(baseBranch);
    }

    await git.raw(['worktree', 'add', worktreeDir, branchName]);
    return worktreeDir;
  }

  async removeWorktree(repoPath: string, branchName: string): Promise<void> {
    const git = this.getGit(repoPath);
    const safeName = branchName.replace(/\//g, '-');
    const worktreeDir = path.join(repoPath, '.worktrees', safeName);

    if (existsSync(worktreeDir)) {
      await git.raw(['worktree', 'remove', worktreeDir, '--force']);
    }
  }

  async listBranches(repoPath: string): Promise<{ current: string; all: string[] }> {
    const git = this.getGit(repoPath);
    const result = await git.branchLocal();
    return { current: result.current, all: result.all };
  }

  async getStatus(dir: string): Promise<{
    modified: string[];
    created: string[];
    deleted: string[];
    staged: string[];
  }> {
    const git = this.getGit(dir);
    const status = await git.status();
    return {
      modified: status.modified,
      created: status.not_added,
      deleted: status.deleted,
      staged: status.staged,
    };
  }

  async getDiff(dir: string, staged = false): Promise<string> {
    const git = this.getGit(dir);
    if (staged) {
      return git.diff(['--cached']);
    }
    return git.diff();
  }

  async getLog(dir: string, limit = 20): Promise<Array<{
    hash: string;
    date: string;
    message: string;
    author: string;
  }>> {
    const git = this.getGit(dir);
    const log = await git.log({ maxCount: limit });
    return log.all.map((entry) => ({
      hash: entry.hash,
      date: entry.date,
      message: entry.message,
      author: entry.author_name,
    }));
  }

  async pushBranch(repoPath: string, branchName: string): Promise<void> {
    const git = this.getGit(repoPath);
    await git.push('origin', branchName, ['--set-upstream']);
  }

  async commit(dir: string, message: string): Promise<string> {
    const git = this.getGit(dir);
    await git.add('.');
    const result = await git.commit(message);
    return result.commit;
  }

  async getCurrentBranch(dir: string): Promise<string> {
    const git = this.getGit(dir);
    const result = await git.branchLocal();
    return result.current;
  }
}

export const gitService = new GitService();
