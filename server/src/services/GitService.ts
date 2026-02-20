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

  /**
   * Returns the unified diff of the current branch against a base branch.
   * Uses `git diff <baseBranch>...HEAD` (three-dot) to show changes since
   * the branch diverged from base. Also includes any uncommitted changes.
   */
  async diffAgainstBase(
    dir: string,
    baseBranch: string = 'main'
  ): Promise<{
    diff: string;
    files: Array<{
      filename: string;
      status: string;
      patch: string;
    }>;
    baseBranch: string;
    currentBranch: string;
  }> {
    const git = this.getGit(dir);
    const currentBranch = (await git.branchLocal()).current;

    // Get the merge-base to diff against
    let mergeBase: string;
    try {
      mergeBase = (await git.raw(['merge-base', baseBranch, 'HEAD'])).trim();
    } catch {
      // If merge-base fails (e.g., no common ancestor), fall back to diffing
      // directly against the base branch ref
      mergeBase = baseBranch;
    }

    // Full unified diff: committed changes since divergence + uncommitted
    const committedDiff = await git.diff([`${mergeBase}...HEAD`]);
    const uncommittedDiff = await git.diff();
    const stagedDiff = await git.diff(['--cached']);

    // Combine all diffs — committed branch changes are the primary content,
    // supplemented by any working tree changes not yet committed
    const fullDiff = [committedDiff, stagedDiff, uncommittedDiff]
      .filter(Boolean)
      .join('\n');

    // Parse diff into per-file entries
    const files = parseDiffIntoFiles(fullDiff);

    return {
      diff: fullDiff,
      files,
      baseBranch,
      currentBranch,
    };
  }
}

/**
 * Parse a unified diff string into per-file entries.
 * Each patch includes the full diff headers (---, +++, @@) needed by
 * parsers like @git-diff-view.
 */
function parseDiffIntoFiles(
  diff: string
): Array<{ filename: string; status: string; patch: string }> {
  if (!diff.trim()) return [];

  const files: Array<{ filename: string; status: string; patch: string }> = [];
  // Split on "diff --git" boundaries
  const parts = diff.split(/^diff --git /m).filter(Boolean);

  for (const part of parts) {
    const lines = part.split('\n');
    // First line: "a/path b/path"
    const headerMatch = lines[0].match(/a\/(.+?)\s+b\/(.+)/);
    if (!headerMatch) continue;

    const filename = headerMatch[2];

    // Determine status from diff headers
    let status = 'modified';
    if (part.includes('new file mode')) status = 'added';
    else if (part.includes('deleted file mode')) status = 'removed';
    else if (part.includes('rename from')) status = 'renamed';

    // Include everything after the "a/path b/path" line:
    // index line, --- a/file, +++ b/file, @@ hunks, and content lines.
    // The parser needs --- and +++ headers to properly parse hunks.
    const patchLines: string[] = [];
    for (let i = 1; i < lines.length; i++) {
      patchLines.push(lines[i]);
    }

    files.push({ filename, status, patch: patchLines.join('\n') });
  }

  return files;
}

export const gitService = new GitService();
