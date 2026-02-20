import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { DiffFile, DiffView, DiffModeEnum } from '@git-diff-view/react';
import { highlighter } from '@git-diff-view/lowlight';
import '@git-diff-view/react/styles/diff-view.css';
import { fetchBranchDiff, type BranchDiffFile } from '../../api/cards.js';
import * as prApi from '../../api/pr.js';
import type { PRData } from '../../api/pr.js';
import { useUiStore } from '../../stores/uiStore.js';
import Badge from '../ui/Badge.js';
import Button from '../ui/Button.js';
import Spinner from '../ui/Spinner.js';
import { cn } from '../../utils/cn.js';

interface PRDiffPanelProps {
  cardId: string;
  prNumber: number | null;
  branchName: string | null;
  hasBranch: boolean;
}

function getFileLang(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, string> = {
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
    py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java',
    css: 'css', scss: 'scss', html: 'html', json: 'json', md: 'markdown',
    yml: 'yaml', yaml: 'yaml', sh: 'bash', sql: 'sql',
  };
  return langMap[ext] || ext;
}

// ── File tree builder ──────────────────────────────────────

interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'dir';
  status?: string;
  children: FileTreeNode[];
}

function buildFileTree(files: BranchDiffFile[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];

  for (const file of files) {
    const parts = file.filename.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const isFile = i === parts.length - 1;
      const path = parts.slice(0, i + 1).join('/');

      let existing = current.find((n) => n.name === name);
      if (!existing) {
        existing = {
          name,
          path,
          type: isFile ? 'file' : 'dir',
          status: isFile ? file.status : undefined,
          children: [],
        };
        current.push(existing);
      }
      current = existing.children;
    }
  }

  return root;
}

// ── File nav sidebar ──────────────────────────────────────

function FileNav({
  files,
  activeFile,
  onFileClick,
}: {
  files: BranchDiffFile[];
  activeFile: string | null;
  onFileClick: (filename: string) => void;
}) {
  const tree = useMemo(() => buildFileTree(files), [files]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = (path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const renderNode = (node: FileTreeNode, depth: number) => {
    if (node.type === 'dir') {
      const isCollapsed = collapsed.has(node.path);
      return (
        <div key={node.path}>
          <button
            onClick={() => toggle(node.path)}
            className="flex w-full items-center gap-1 px-2 py-0.5 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
            style={{ paddingLeft: depth * 12 + 8 }}
          >
            <svg
              className={cn('h-3 w-3 shrink-0 transition-transform', isCollapsed ? '' : 'rotate-90')}
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
            </svg>
            <svg className="h-3.5 w-3.5 shrink-0 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
              <path d="M3.75 3A1.75 1.75 0 002 4.75v3.26a3.235 3.235 0 011.75-.51h12.5c.644 0 1.245.188 1.75.51V6.75A1.75 1.75 0 0016.25 5h-4.836a.25.25 0 01-.177-.073L9.823 3.513A1.75 1.75 0 008.586 3H3.75z" />
              <path d="M3.75 9A1.75 1.75 0 002 10.75v4.5c0 .966.784 1.75 1.75 1.75h12.5A1.75 1.75 0 0018 15.25v-4.5A1.75 1.75 0 0016.25 9H3.75z" />
            </svg>
            <span className="truncate">{node.name}</span>
          </button>
          {!isCollapsed && node.children.map((child) => renderNode(child, depth + 1))}
        </div>
      );
    }

    const statusColor =
      node.status === 'added' ? 'text-green-600' :
      node.status === 'removed' ? 'text-red-600' :
      'text-amber-600';

    return (
      <button
        key={node.path}
        onClick={() => onFileClick(node.path)}
        className={cn(
          'flex w-full items-center gap-1.5 px-2 py-0.5 text-xs rounded',
          activeFile === node.path
            ? 'bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800',
        )}
        style={{ paddingLeft: depth * 12 + 8 }}
        title={node.path}
      >
        <svg className="h-3.5 w-3.5 shrink-0 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 003 3.5v13A1.5 1.5 0 004.5 18h11a1.5 1.5 0 001.5-1.5V7.621a1.5 1.5 0 00-.44-1.06l-4.12-4.122A1.5 1.5 0 0011.378 2H4.5z" clipRule="evenodd" />
        </svg>
        <span className="truncate">{node.name}</span>
        <span className={cn('ml-auto shrink-0 text-[10px] font-medium', statusColor)}>
          {node.status === 'added' ? 'A' : node.status === 'removed' ? 'D' : 'M'}
        </span>
      </button>
    );
  };

  return (
    <div className="space-y-px py-1">
      {tree.map((node) => renderNode(node, 0))}
    </div>
  );
}

// ── Single file diff using DiffFile instance ──────────────

function FileDiff({
  file,
  diffMode,
  scrollRef,
}: {
  file: BranchDiffFile;
  diffMode: DiffModeEnum;
  scrollRef: (el: HTMLDivElement | null) => void;
}) {
  const isDarkMode = useUiStore((s) => s.isDarkMode);
  const lang = getFileLang(file.filename);

  const diffFileInstance = useMemo(() => {
    if (!file.patch) return null;
    const instance = DiffFile.createInstance({
      oldFile: { fileName: file.filename, fileLang: lang, content: '' },
      newFile: { fileName: file.filename, fileLang: lang, content: '' },
      hunks: [file.patch],
    });
    instance.init();
    instance.buildSplitDiffLines();
    instance.buildUnifiedDiffLines();
    return instance;
  }, [file.patch, file.filename, lang]);

  const statusColor =
    file.status === 'added' ? 'text-green-600' :
    file.status === 'removed' ? 'text-red-600' :
    'text-gray-600';

  return (
    <div ref={scrollRef} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <div className="bg-gray-50 dark:bg-gray-800 px-3 py-1.5 text-xs font-mono text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2 sticky top-0 z-[1]">
        <span className={statusColor}>
          {file.status === 'added' ? '+' : file.status === 'removed' ? '-' : '~'}
        </span>
        {file.filename}
      </div>
      {diffFileInstance ? (
        <DiffView
          className="text-[13px]"
          diffFile={diffFileInstance}
          diffViewMode={diffMode}
          diffViewTheme={isDarkMode ? 'dark' : 'light'}
          diffViewHighlight
          diffViewWrap
          diffViewFontSize={13}
          registerHighlighter={highlighter}
        />
      ) : (
        <div className="p-3 text-xs text-gray-400 text-center">
          Binary file or no diff available
        </div>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────

export default function PRDiffPanel({ cardId, prNumber, branchName, hasBranch }: PRDiffPanelProps) {
  const isDarkMode = useUiStore((s) => s.isDarkMode);
  const [files, setFiles] = useState<BranchDiffFile[]>([]);
  const [baseBranch, setBaseBranch] = useState('main');
  const [currentBranch, setCurrentBranch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [splitView, setSplitView] = useState(true);
  const [activeFile, setActiveFile] = useState<string | null>(null);

  // Optional PR state
  const [pr, setPr] = useState<PRData | null>(null);
  const [prLoading, setPrLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  // Refs for scroll-to-file
  const fileRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const loadBranchDiff = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchBranchDiff(cardId);
      setFiles(result.files);
      setBaseBranch(result.baseBranch);
      setCurrentBranch(result.currentBranch);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [cardId]);

  useEffect(() => {
    if (hasBranch) {
      loadBranchDiff();
    }
  }, [hasBranch, loadBranchDiff]);

  useEffect(() => {
    if (prNumber) {
      setPrLoading(true);
      prApi.fetchPR(cardId)
        .then(setPr)
        .catch(() => {})
        .finally(() => setPrLoading(false));
    }
  }, [cardId, prNumber]);

  const handleCreatePR = async () => {
    setCreating(true);
    try {
      const prData = await prApi.createPR(cardId, branchName || 'PR', '');
      setPr(prData);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const handleFileClick = useCallback((filename: string) => {
    setActiveFile(filename);
    const el = fileRefs.current.get(filename);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  if (!hasBranch) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-400">
        <div className="text-center">
          <p>No branch assigned to this card</p>
          <p className="text-xs mt-1">Create a branch to see diffs</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const diffMode = splitView ? DiffModeEnum.SplitGitHub : DiffModeEnum.Unified;

  return (
    <div className="flex h-full flex-col">
      {/* Header bar */}
      <div className="shrink-0 border-b border-gray-200 dark:border-gray-700 px-4 py-3 bg-white dark:bg-gray-900">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {currentBranch || branchName}
          </h3>
          <span className="text-xs text-gray-400 dark:text-gray-500">vs</span>
          <span className="text-xs font-mono text-gray-600 dark:text-gray-400">{baseBranch}</span>
          <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
            {files.length} file{files.length !== 1 ? 's' : ''} changed
          </span>
        </div>

        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setSplitView(!splitView)}
            className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            {splitView ? 'Unified view' : 'Split view'}
          </button>
          <button
            onClick={loadBranchDiff}
            className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            Refresh
          </button>

          {pr ? (
            <>
              <Badge
                variant="solid"
                color={
                  pr.state === 'open' ? '#22c55e' :
                  pr.state === 'closed' ? '#ef4444' : '#8b5cf6'
                }
              >
                PR #{pr.number} {pr.state}
              </Badge>
              {pr.html_url && (
                <a
                  href={pr.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  View on GitHub
                </a>
              )}
            </>
          ) : !prNumber && !prLoading && branchName ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCreatePR}
              disabled={creating}
            >
              {creating ? 'Creating PR...' : 'Create PR'}
            </Button>
          ) : null}
        </div>
      </div>

      {error && <div className="px-4 py-2 text-sm text-red-600 shrink-0">{error}</div>}

      {/* Content: file nav + diffs */}
      <div className="flex flex-1 overflow-hidden">
        {/* File navigation sidebar */}
        {files.length > 0 && (
          <div className="w-[220px] shrink-0 border-r border-gray-200 dark:border-gray-700 overflow-y-auto bg-white dark:bg-gray-900">
            <div className="px-3 py-2 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
              Files
            </div>
            <FileNav
              files={files}
              activeFile={activeFile}
              onFileClick={handleFileClick}
            />
          </div>
        )}

        {/* Diff content */}
        <div className="flex-1 overflow-y-auto">
          <div className="space-y-4 p-4">
            {files.map((file) => (
              <FileDiff
                key={file.filename}
                file={file}
                diffMode={diffMode}
                scrollRef={(el) => {
                  if (el) fileRefs.current.set(file.filename, el);
                  else fileRefs.current.delete(file.filename);
                }}
              />
            ))}

            {files.length === 0 && (
              <p className="text-center text-sm text-gray-400 py-8">No changes on this branch</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
