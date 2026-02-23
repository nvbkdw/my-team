import { useState, useCallback, useRef, useEffect } from 'react';
import { useDevServerStore, type DevServerStatus } from '../../stores/devServerStore.js';
import * as devserverApi from '../../api/devserver.js';
import Button from '../ui/Button.js';
import Spinner from '../ui/Spinner.js';
import { cn } from '../../utils/cn.js';

interface PreviewPanelProps {
  cardId: string;
  hasBranch: boolean;
}

const statusColors: Record<DevServerStatus, string> = {
  stopped: 'bg-gray-400',
  starting: 'bg-amber-400 animate-pulse',
  running: 'bg-green-500',
  stopping: 'bg-amber-400 animate-pulse',
  error: 'bg-red-500',
};

const statusLabels: Record<DevServerStatus, string> = {
  stopped: 'Stopped',
  starting: 'Starting...',
  running: 'Running',
  stopping: 'Stopping...',
  error: 'Error',
};

function normalizePath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed || trimmed === '/') return '/';
  return trimmed.startsWith('/') ? trimmed : '/' + trimmed;
}

export default function PreviewPanel({ cardId, hasBranch }: PreviewPanelProps) {
  const status = useDevServerStore((s) => s.statuses[cardId] ?? 'stopped') as DevServerStatus;
  const port = useDevServerStore((s) => s.ports[cardId]);
  const directUrl = useDevServerStore((s) => s.urls[cardId]);
  const previewUrl = useDevServerStore((s) => s.previewUrls[cardId]);
  const error = useDevServerStore((s) => s.errors[cardId]);

  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Address bar state
  const [pathInput, setPathInput] = useState('/');
  const [iframeSrc, setIframeSrc] = useState<string | null>(null);
  // Track whether the user is actively editing the input
  const isEditingRef = useRef(false);

  // Listen for postMessage from the injected navigation script in the iframe
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (
        event.data &&
        event.data.type === '__devserver_nav' &&
        typeof event.data.path === 'string'
      ) {
        // Only update if we're not mid-edit
        if (!isEditingRef.current) {
          setPathInput(event.data.path);
        }
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // When server starts running, load the iframe
  useEffect(() => {
    if (status === 'running' && previewUrl) {
      setIframeSrc(previewUrl + normalizePath(pathInput));
    } else if (status === 'stopped' || status === 'error') {
      setIframeSrc(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, previewUrl]);

  const navigateToPath = useCallback(() => {
    if (!previewUrl) return;
    isEditingRef.current = false;
    const fullUrl = previewUrl + normalizePath(pathInput);
    setIframeSrc(fullUrl);
  }, [previewUrl, pathInput]);

  const handlePathKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      navigateToPath();
    }
  }, [navigateToPath]);

  const handleStart = useCallback(async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      await devserverApi.startDevServer(cardId);
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setActionLoading(false);
    }
  }, [cardId]);

  const handleStop = useCallback(async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      await devserverApi.stopDevServer(cardId);
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setActionLoading(false);
    }
  }, [cardId]);

  const handleRefresh = useCallback(() => {
    if (iframeRef.current && iframeSrc) {
      iframeRef.current.src = '';
      requestAnimationFrame(() => {
        if (iframeRef.current) iframeRef.current.src = iframeSrc;
      });
    }
  }, [iframeSrc]);

  /** Full direct URL for "Open in browser" (bypasses proxy → full HMR) */
  const openInBrowserUrl = directUrl ? directUrl + normalizePath(pathInput) : null;

  if (!hasBranch) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-400">
        <div className="text-center">
          <p>No branch assigned to this card</p>
          <p className="text-xs mt-1">Create a branch to preview the dev server</p>
        </div>
      </div>
    );
  }

  const isRunning = status === 'running';
  const isTransitioning = status === 'starting' || status === 'stopping';

  return (
    <div className="flex h-full flex-col">
      {/* Control bar */}
      <div className="shrink-0 border-b border-gray-200 dark:border-gray-700 px-3 py-2 bg-white dark:bg-gray-900 flex items-center gap-2">
        {/* Status dot */}
        <span className={cn('inline-block h-2 w-2 rounded-full shrink-0', statusColors[status])} title={statusLabels[status]} />

        {/* URL bar — shown when server is running or starting */}
        {(isRunning || status === 'starting') && previewUrl ? (
          <div className="flex flex-1 items-center min-w-0 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 overflow-hidden">
            {/* Origin prefix (non-editable) */}
            <span className="shrink-0 px-2 py-1 text-xs font-mono text-gray-400 dark:text-gray-500 select-none border-r border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800/80">
              localhost:{port}
            </span>
            {/* Editable path input */}
            <input
              type="text"
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              onFocus={() => { isEditingRef.current = true; }}
              onBlur={() => {
                isEditingRef.current = false;
                navigateToPath();
              }}
              onKeyDown={handlePathKeyDown}
              placeholder="/"
              className="flex-1 min-w-0 px-1.5 py-1 text-xs font-mono bg-transparent text-gray-800 dark:text-gray-200 outline-none placeholder-gray-300 dark:placeholder-gray-600"
              spellCheck={false}
            />
            {/* Go button */}
            <button
              onClick={navigateToPath}
              className="shrink-0 px-1.5 py-1 text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
              title="Navigate (Enter)"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        ) : (
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
            {statusLabels[status]}
          </span>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-1 shrink-0">
          {isRunning && (
            <>
              <button
                onClick={handleRefresh}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors"
                title="Refresh preview"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H4.598a.75.75 0 00-.75.75v3.634a.75.75 0 001.5 0v-2.033l.312.311a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm-11.23-3.15a.75.75 0 00.713.527h.002a.75.75 0 00.735-.574 5.5 5.5 0 019.2-2.467l.313.311H12.61a.75.75 0 000 1.5h3.634a.75.75 0 00.75-.75V3.186a.75.75 0 00-1.5 0v2.034l-.312-.312A7 7 0 003.47 8.083a.75.75 0 00.612.19z" clipRule="evenodd" />
                </svg>
              </button>
              {openInBrowserUrl && (
                <a
                  href={openInBrowserUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors"
                  title="Open in browser (direct, with HMR)"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5zm7.25-.75a.75.75 0 01.75-.75h3.5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0V6.31l-5.47 5.47a.75.75 0 11-1.06-1.06l5.47-5.47H12.25a.75.75 0 01-.75-.75z" clipRule="evenodd" />
                  </svg>
                </a>
              )}
            </>
          )}

          {status === 'stopped' || status === 'error' ? (
            <Button
              size="sm"
              variant="primary"
              onClick={handleStart}
              disabled={actionLoading || isTransitioning}
            >
              {actionLoading ? 'Starting...' : 'Start Dev Server'}
            </Button>
          ) : isRunning ? (
            <Button
              size="sm"
              variant="danger"
              onClick={handleStop}
              disabled={actionLoading || isTransitioning}
            >
              Stop
            </Button>
          ) : null}
        </div>
      </div>

      {/* Error display */}
      {(actionError || error) && (
        <div className="shrink-0 px-4 py-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
          {actionError || error}
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 overflow-hidden">
        {isRunning && iframeSrc ? (
          <iframe
            ref={iframeRef}
            src={iframeSrc}
            className="h-full w-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            title="Dev server preview"
          />
        ) : status === 'starting' ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <Spinner />
              <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Starting dev server...</p>
              {port && (
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Port {port}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-gray-400 dark:text-gray-500">
            <div className="text-center">
              <svg className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1}>
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <path d="M8 21h8M12 17v4" />
              </svg>
              <p className="mt-3">No dev server running</p>
              <p className="text-xs mt-1">Click "Start Dev Server" to preview your app</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
