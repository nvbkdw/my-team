import { watch, FSWatcher, readFileSync } from 'node:fs';
import path from 'node:path';
import ignore, { type Ignore } from 'ignore';

const DEBOUNCE_MS = 500;
const ALWAYS_IGNORED = ['.git', '.worktrees', 'node_modules', '.DS_Store', 'dist', 'build', '.next', '__pycache__', '.cache', 'coverage', '.turbo'];

function loadGitignore(dir: string): Ignore {
  const ig = ignore();
  ig.add(ALWAYS_IGNORED);
  try {
    const raw = readFileSync(path.join(dir, '.gitignore'), 'utf-8');
    ig.add(raw);
  } catch {
    // No .gitignore found — fall back to always-ignored only
  }
  return ig;
}

export class FileWatcher {
  private watcher: FSWatcher | null = null;
  private pendingFiles = new Set<string>();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private onChange: (files: string[]) => void;
  private dir: string;
  private ig: Ignore;

  constructor(dir: string, onChange: (files: string[]) => void) {
    this.dir = dir;
    this.onChange = onChange;
    this.ig = loadGitignore(dir);
  }

  start(): void {
    if (this.watcher) return;

    try {
      this.watcher = watch(this.dir, { recursive: true }, (_event, filename) => {
        if (!filename) return;
        if (this.ig.ignores(filename)) return;

        this.pendingFiles.add(filename);
        this.scheduleFlush();
      });

      this.watcher.on('error', (err) => {
        console.error(`[FileWatcher] Error watching ${this.dir}:`, err.message);
      });
    } catch (err) {
      console.error(`[FileWatcher] Failed to start watching ${this.dir}:`, err);
    }
  }

  private scheduleFlush(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      const files = Array.from(this.pendingFiles);
      this.pendingFiles.clear();
      if (files.length > 0) {
        this.onChange(files);
      }
    }, DEBOUNCE_MS);
  }

  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    this.pendingFiles.clear();
  }
}
