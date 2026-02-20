import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { isPathSafe } from '../utils/pathSecurity.js';

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeNode[];
}

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.worktrees',
  'dist',
  'build',
  '.next',
  '__pycache__',
  '.cache',
  'coverage',
  '.turbo',
]);

const IGNORED_FILES = new Set(['.DS_Store', 'Thumbs.db']);

function loadGitignorePatterns(dir: string): string[] {
  const gitignorePath = path.join(dir, '.gitignore');
  if (!existsSync(gitignorePath)) return [];
  try {
    const content = readFileSync(gitignorePath, 'utf-8');
    return content
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
  } catch {
    return [];
  }
}

function shouldIgnore(name: string, gitignorePatterns: string[]): boolean {
  if (IGNORED_DIRS.has(name) || IGNORED_FILES.has(name)) return true;
  if (name.startsWith('.')) return true;
  for (const pattern of gitignorePatterns) {
    const clean = pattern.replace(/\/$/, '');
    if (name === clean) return true;
  }
  return false;
}

export class FileService {
  async getDirectoryTree(
    rootDir: string,
    relativePath = '',
    depth = 0,
    maxDepth = 5
  ): Promise<FileTreeNode[]> {
    if (depth >= maxDepth) return [];

    const fullPath = path.join(rootDir, relativePath);
    if (!isPathSafe(fullPath, rootDir)) {
      throw new Error('Path traversal detected');
    }

    const gitignorePatterns = depth === 0 ? loadGitignorePatterns(fullPath) : [];
    const entries = await readdir(fullPath, { withFileTypes: true });
    const nodes: FileTreeNode[] = [];

    const sorted = entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const entry of sorted) {
      if (shouldIgnore(entry.name, gitignorePatterns)) continue;

      const entryRelative = path.join(relativePath, entry.name);

      if (entry.isDirectory()) {
        const children = await this.getDirectoryTree(
          rootDir,
          entryRelative,
          depth + 1,
          maxDepth
        );
        nodes.push({
          name: entry.name,
          path: entryRelative,
          type: 'directory',
          children,
        });
      } else {
        nodes.push({
          name: entry.name,
          path: entryRelative,
          type: 'file',
        });
      }
    }

    return nodes;
  }

  async readFile(rootDir: string, relativePath: string): Promise<string> {
    const fullPath = path.resolve(rootDir, relativePath);
    if (!isPathSafe(fullPath, rootDir)) {
      throw new Error('Path traversal detected');
    }
    return readFile(fullPath, 'utf-8');
  }

  async writeFile(rootDir: string, relativePath: string, content: string): Promise<void> {
    const fullPath = path.resolve(rootDir, relativePath);
    if (!isPathSafe(fullPath, rootDir)) {
      throw new Error('Path traversal detected');
    }
    await writeFile(fullPath, content, 'utf-8');
  }

  async getFileInfo(
    rootDir: string,
    relativePath: string
  ): Promise<{ size: number; modified: string }> {
    const fullPath = path.resolve(rootDir, relativePath);
    if (!isPathSafe(fullPath, rootDir)) {
      throw new Error('Path traversal detected');
    }
    const stats = await stat(fullPath);
    return {
      size: stats.size,
      modified: stats.mtime.toISOString(),
    };
  }
}

export const fileService = new FileService();
