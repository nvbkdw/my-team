import { useState, useEffect } from 'react';
import * as prApi from '../../api/pr.js';
import type { PRData, PRFile } from '../../api/pr.js';
import DiffViewer from './DiffViewer.js';
import Badge from '../ui/Badge.js';
import Button from '../ui/Button.js';
import Spinner from '../ui/Spinner.js';

interface PRDiffTabProps {
  cardId: string;
  prNumber: number | null;
  branchName: string | null;
}

export default function PRDiffTab({ cardId, prNumber, branchName }: PRDiffTabProps) {
  const [pr, setPr] = useState<PRData | null>(null);
  const [files, setFiles] = useState<PRFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [splitView, setSplitView] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (prNumber) {
      loadPR();
    }
  }, [prNumber]);

  const loadPR = async () => {
    setLoading(true);
    setError(null);
    try {
      const [prData, prFiles] = await Promise.all([
        prApi.fetchPR(cardId),
        prApi.fetchPRFiles(cardId),
      ]);
      setPr(prData);
      setFiles(prFiles);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePR = async () => {
    setCreating(true);
    setError(null);
    try {
      const prData = await prApi.createPR(
        cardId,
        branchName || 'PR',
        ''
      );
      setPr(prData);
      const prFiles = await prApi.fetchPRFiles(cardId);
      setFiles(prFiles);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  if (!prNumber && !branchName) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-400">
        <div className="text-center">
          <p>No branch assigned to this card</p>
          <p className="text-xs mt-1">Create a branch first to open a PR</p>
        </div>
      </div>
    );
  }

  if (!prNumber) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-sm text-gray-500">No pull request yet</p>
        <Button
          variant="primary"
          onClick={handleCreatePR}
          disabled={creating}
        >
          {creating ? 'Creating...' : 'Create Pull Request'}
        </Button>
        {error && <p className="text-sm text-red-600">{error}</p>}
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

  return (
    <div className="h-full overflow-y-auto">
      {/* PR Header */}
      {pr && (
        <div className="border-b border-gray-200 p-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900">{pr.title}</h3>
            <Badge
              variant="solid"
              color={
                pr.state === 'open'
                  ? '#22c55e'
                  : pr.state === 'closed'
                    ? '#ef4444'
                    : '#8b5cf6'
              }
            >
              {pr.state}
            </Badge>
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
            <span>{pr.head.ref} → {pr.base.ref}</span>
            <span>+{pr.additions} / -{pr.deletions}</span>
            <span>{pr.changed_files} files</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={() => setSplitView(!splitView)}
              className="text-xs text-indigo-600 hover:underline"
            >
              {splitView ? 'Unified view' : 'Split view'}
            </button>
            <button
              onClick={loadPR}
              className="text-xs text-indigo-600 hover:underline"
            >
              Refresh
            </button>
            {pr.html_url && (
              <a
                href={pr.html_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-indigo-600 hover:underline"
              >
                View on GitHub
              </a>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 text-sm text-red-600">{error}</div>
      )}

      {/* File diffs */}
      <div className="space-y-4 p-4">
        {files.map((file) => (
          <DiffViewer
            key={file.filename}
            filename={file.filename}
            oldValue={file.patch ? extractOld(file.patch) : ''}
            newValue={file.patch ? extractNew(file.patch) : ''}
            splitView={splitView}
          />
        ))}

        {files.length === 0 && !loading && (
          <p className="text-center text-sm text-gray-400">No file changes</p>
        )}
      </div>
    </div>
  );
}

/**
 * Simple patch parser: extract old/new content from unified diff patch.
 * This is a simplified version; a real implementation would need a proper diff parser.
 */
function extractOld(patch: string): string {
  return patch
    .split('\n')
    .filter((l) => !l.startsWith('+') || l.startsWith('+++'))
    .map((l) => (l.startsWith('-') ? l.slice(1) : l.startsWith(' ') ? l.slice(1) : l))
    .join('\n');
}

function extractNew(patch: string): string {
  return patch
    .split('\n')
    .filter((l) => !l.startsWith('-') || l.startsWith('---'))
    .map((l) => (l.startsWith('+') ? l.slice(1) : l.startsWith(' ') ? l.slice(1) : l))
    .join('\n');
}
