import { watch, FSWatcher } from 'node:fs';
import path from 'node:path';

const DEBOUNCE_MS = 500;
const IGNORED_PATTERNS = [
  /node_modules/,
  /\.git/,
  /\.worktrees/,
  /\.DS_Store/,
  /dist\//,
];

export class FileWatcher {
  private watcher: FSWatcher | null = null;
  private pendingFiles = new Set<string>();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private onChange: (files: string[]) => void;
  private dir: string;

  constructor(dir: string, onChange: (files: string[]) => void) {
    this.dir = dir;
    this.onChange = onChange;
  }

  start(): void {
    if (this.watcher) return;

    try {
      this.watcher = watch(this.dir, { recursive: true }, (_event, filename) => {
        if (!filename) return;
        if (IGNORED_PATTERNS.some((p) => p.test(filename))) return;

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
