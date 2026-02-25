import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useHistoryStore } from '../../stores/historyStore.js';
import { fetchTraces, type TraceEntry } from '../../api/traces.js';

interface HistoryPanelProps {
  cardId: string;
}

// A merged tool action (tool_use + tool_result combined)
interface MergedToolItem {
  kind: 'tool';
  name: string;
  toolUseId: string;
  input: unknown;
  result?: string;
  description: string;
  ts: string;
  run: number;
  pending: boolean;
}

// A pass-through non-tool entry
interface PassthroughItem {
  kind: 'entry';
  entry: TraceEntry;
}

type DisplayItem = MergedToolItem | PassthroughItem;

export default function HistoryPanel({ cardId }: HistoryPanelProps) {
  const entries = useHistoryStore((s) => s.entries[cardId] ?? []);
  const loading = useHistoryStore((s) => s.loading[cardId] ?? false);
  const initialized = useHistoryStore((s) => s.initialized[cardId] ?? false);
  const [selectedRun, setSelectedRun] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);

  const loadTraces = useCallback(async () => {
    useHistoryStore.getState().setLoading(cardId, true);
    try {
      const res = await fetchTraces(cardId, { limit: 1000 });
      useHistoryStore.getState().setEntries(cardId, res.entries);
      useHistoryStore.getState().setInitialized(cardId, true);
    } catch {
      useHistoryStore.getState().setInitialized(cardId, true);
    } finally {
      useHistoryStore.getState().setLoading(cardId, false);
    }
  }, [cardId]);

  useEffect(() => {
    if (!initialized) {
      loadTraces();
    }
  }, [initialized, loadTraces]);

  useEffect(() => {
    if (shouldAutoScroll.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries.length]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    shouldAutoScroll.current = scrollHeight - scrollTop - clientHeight < 60;
  }, []);

  const runs = useMemo(() => {
    const set = new Set<number>();
    for (const e of entries) {
      if (e.run > 0) set.add(e.run);
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [entries]);

  const filtered = useMemo(() => {
    if (selectedRun === null) return entries;
    return entries.filter((e) => e.run === selectedRun || e.run === 0);
  }, [entries, selectedRun]);

  // Merge tool_use + tool_result pairs into single display items
  const displayItems = useMemo(() => mergeToolEntries(filtered), [filtered]);

  if (loading && !initialized) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-400">
        Loading trace history...
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-400 dark:text-gray-500">
        <div className="text-center">
          <svg className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path d="M12 8v4l3 3" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="12" cy="12" r="9" />
          </svg>
          <p className="mt-2">No trace history yet</p>
          <p className="text-xs mt-1">Send a message to the AI agent to start logging</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Run filter bar */}
      <div className="shrink-0 border-b border-gray-200 dark:border-gray-700 px-3 py-1.5 bg-white dark:bg-gray-900 flex items-center gap-1 overflow-x-auto">
        <button
          onClick={() => setSelectedRun(null)}
          className={`px-2 py-0.5 text-xs rounded-full whitespace-nowrap transition-colors ${
            selectedRun === null
              ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-medium'
              : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          All
        </button>
        {runs.map((run) => (
          <button
            key={run}
            onClick={() => setSelectedRun(run)}
            className={`px-2 py-0.5 text-xs rounded-full whitespace-nowrap transition-colors ${
              selectedRun === run
                ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-medium'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            Run {run}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={loadTraces}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 dark:text-gray-500 transition-colors"
          title="Refresh"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H4.598a.75.75 0 00-.75.75v3.634a.75.75 0 001.5 0v-2.033l.312.311a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm-11.23-3.15a.75.75 0 00.713.527h.002a.75.75 0 00.735-.574 5.5 5.5 0 019.2-2.467l.313.311H12.61a.75.75 0 000 1.5h3.634a.75.75 0 00.75-.75V3.186a.75.75 0 00-1.5 0v2.034l-.312-.312A7 7 0 003.47 8.083a.75.75 0 00.612.19z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {/* Timeline */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5"
      >
        {displayItems.map((item, i) =>
          item.kind === 'tool' ? (
            <ToolRow key={`tool-${item.toolUseId}-${i}`} item={item} />
          ) : (
            <EntryRow key={`entry-${item.entry.ts}-${i}`} entry={item.entry} />
          )
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Merge logic: pair tool_use + tool_result by toolUseId
// ---------------------------------------------------------------------------

function mergeToolEntries(entries: TraceEntry[]): DisplayItem[] {
  // Build a map of toolUseId → tool_result entry
  const resultMap = new Map<string, TraceEntry>();
  for (const e of entries) {
    if (e.type === 'tool_result' && e.toolUseId) {
      resultMap.set(e.toolUseId as string, e);
    }
  }

  const consumedResultIds = new Set<string>();
  const items: DisplayItem[] = [];

  for (const entry of entries) {
    if (entry.type === 'tool_use') {
      const toolUseId = (entry.toolUseId as string) ?? '';
      const name = (entry.name as string) ?? 'unknown';
      const resultEntry = toolUseId ? resultMap.get(toolUseId) : undefined;
      if (resultEntry) consumedResultIds.add(toolUseId);

      items.push({
        kind: 'tool',
        name,
        toolUseId,
        input: entry.input,
        result: resultEntry ? (resultEntry.result as string) : undefined,
        description: extractDescription(name, entry.input),
        ts: entry.ts,
        run: entry.run,
        pending: !resultEntry,
      });
    } else if (entry.type === 'tool_result') {
      // Skip if already consumed by a merged tool item
      const id = (entry.toolUseId as string) ?? '';
      if (consumedResultIds.has(id)) continue;
      // Orphaned result (no matching tool_use) — show standalone
      items.push({ kind: 'entry', entry });
    } else {
      items.push({ kind: 'entry', entry });
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// Inline description extraction per tool type
// ---------------------------------------------------------------------------

function extractDescription(toolName: string, rawInput: unknown): string {
  const input = parseInput(rawInput);
  if (!input) return '';

  const lower = toolName.toLowerCase();

  if (lower === 'grep') {
    const parts: string[] = [];
    if (input.pattern) parts.push(`/${input.pattern}/`);
    if (input.path) parts.push(shortenPath(input.path));
    else if (input.glob) parts.push(input.glob);
    return parts.join(' in ');
  }

  if (lower === 'read') {
    return input.file_path ? shortenPath(input.file_path) : '';
  }

  if (lower === 'bash') {
    if (input.description) return truncateInline(input.description, 80);
    if (input.command) return truncateInline(input.command, 80);
    return '';
  }

  if (lower === 'glob') {
    const parts: string[] = [];
    if (input.pattern) parts.push(input.pattern);
    if (input.path) parts.push(`in ${shortenPath(input.path)}`);
    return parts.join(' ');
  }

  if (lower === 'write') {
    return input.file_path ? shortenPath(input.file_path) : '';
  }

  if (lower === 'edit') {
    return input.file_path ? shortenPath(input.file_path) : '';
  }

  if (lower === 'task') {
    return input.description ? truncateInline(input.description, 80) : '';
  }

  if (lower === 'webfetch') {
    return input.url ? truncateInline(input.url, 80) : '';
  }

  if (lower === 'websearch') {
    return input.query ? truncateInline(input.query, 80) : '';
  }

  if (lower === 'lsp') {
    const parts: string[] = [];
    if (input.operation) parts.push(input.operation);
    if (input.filePath) parts.push(shortenPath(input.filePath));
    return parts.join(' ');
  }

  if (lower === 'notebookedit') {
    return input.notebook_path ? shortenPath(input.notebook_path) : '';
  }

  // Generic fallback: try common field names
  if (input.file_path) return shortenPath(input.file_path);
  if (input.path) return shortenPath(input.path);
  if (input.command) return truncateInline(input.command, 60);
  return '';
}

function parseInput(raw: unknown): Record<string, string> | null {
  if (raw == null) return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const obj: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      obj[k] = typeof v === 'string' ? v : JSON.stringify(v);
    }
    return obj;
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) {
        return parseInput(parsed);
      }
    } catch { /* not json */ }
  }
  return null;
}

function shortenPath(p: string, maxLen = 50): string {
  if (p.length <= maxLen) return p;
  const parts = p.split('/');
  const filename = parts[parts.length - 1];
  if (filename.length >= maxLen - 4) return '.../' + filename.slice(-(maxLen - 4));
  // Keep last N segments that fit
  let result = filename;
  for (let i = parts.length - 2; i >= 0; i--) {
    const candidate = parts[i] + '/' + result;
    if (candidate.length + 4 > maxLen) {
      return '.../' + result;
    }
    result = candidate;
  }
  return result;
}

function truncateInline(s: string, max: number): string {
  const oneLine = s.replace(/\n/g, ' ').trim();
  return oneLine.length > max ? oneLine.slice(0, max) + '...' : oneLine;
}

// ---------------------------------------------------------------------------
// Merged tool row (combined tool_use + tool_result)
// ---------------------------------------------------------------------------

function ToolRow({ item }: { item: MergedToolItem }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="py-0.5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[11px] hover:text-gray-700 dark:hover:text-gray-300 w-full text-left"
      >
        <ChevronIcon expanded={expanded} />
        <span className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${
          item.pending ? 'bg-amber-400 animate-pulse' : 'bg-green-400'
        }`} />
        <span className="font-medium text-amber-700 dark:text-amber-400 font-mono shrink-0">
          {item.name}
        </span>
        {item.description && (
          <span className="text-gray-500 dark:text-gray-400 truncate min-w-0">
            {item.description}
          </span>
        )}
        <span className="text-gray-400 dark:text-gray-500 shrink-0 ml-auto">
          {formatTime(item.ts)}
        </span>
      </button>
      {expanded && (
        <div className="ml-5 mt-1 space-y-1">
          {/* Input */}
          <div>
            <div className="text-[10px] font-medium text-gray-400 dark:text-gray-500 mb-0.5 uppercase tracking-wide">Input</div>
            <pre className="text-[11px] text-gray-600 dark:text-gray-300 whitespace-pre-wrap max-h-48 overflow-y-auto bg-amber-50 dark:bg-amber-900/10 rounded p-2 border border-amber-100 dark:border-amber-900/30">
              {formatJson(item.input)}
            </pre>
          </div>
          {/* Result */}
          {item.result != null ? (
            <div>
              <div className="text-[10px] font-medium text-gray-400 dark:text-gray-500 mb-0.5 uppercase tracking-wide">Result</div>
              <pre className="text-[11px] text-gray-600 dark:text-gray-300 whitespace-pre-wrap max-h-48 overflow-y-auto bg-green-50 dark:bg-green-900/10 rounded p-2 border border-green-100 dark:border-green-900/30">
                {truncateDisplay(item.result)}
              </pre>
            </div>
          ) : (
            <div className="text-[10px] text-amber-500 dark:text-amber-400 italic">Running...</div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Non-tool entry row
// ---------------------------------------------------------------------------

function EntryRow({ entry }: { entry: TraceEntry }) {
  const [expanded, setExpanded] = useState(false);

  switch (entry.type) {
    case 'run_start':
      return (
        <div className="border-t-2 border-indigo-300 dark:border-indigo-700 pt-2 mt-3 first:mt-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
              Run {entry.run}
            </span>
            <span className="text-[10px] text-gray-400">{formatTime(entry.ts)}</span>
          </div>
          {entry.message ? (
            <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5 line-clamp-2">
              {String(entry.message)}
            </p>
          ) : null}
        </div>
      );

    case 'system_init':
      return (
        <div className="flex items-center gap-2 py-0.5 text-[11px] text-gray-400 dark:text-gray-500">
          <span className="font-mono">sys</span>
          <span>{entry.model as string}</span>
          <span className="text-gray-300 dark:text-gray-600">|</span>
          <span>{(entry.tools as string[])?.length ?? 0} tools</span>
        </div>
      );

    case 'assistant_text':
      return (
        <div className="border-l-2 border-gray-200 dark:border-gray-700 pl-2 py-0.5">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 w-full text-left"
          >
            <ChevronIcon expanded={expanded} />
            <span className="font-medium shrink-0">Assistant</span>
            <span className="text-gray-400 dark:text-gray-500 truncate min-w-0">
              {truncateInline(String(entry.text ?? ''), 80)}
            </span>
            <span className="text-gray-400 dark:text-gray-500 shrink-0 ml-auto">{formatTime(entry.ts)}</span>
          </button>
          {expanded && (
            <pre className="mt-1 text-[11px] text-gray-600 dark:text-gray-300 whitespace-pre-wrap max-h-60 overflow-y-auto bg-gray-50 dark:bg-gray-800/50 rounded p-2">
              {entry.text as string}
            </pre>
          )}
        </div>
      );

    case 'run_end':
      return (
        <div className="flex items-center gap-2 py-1 text-[11px] text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800 mb-1">
          <span className="font-medium">Done</span>
          {entry.costUsd != null && (
            <span>${(entry.costUsd as number).toFixed(4)}</span>
          )}
          {entry.numTurns != null && (
            <span>{entry.numTurns as number} turns</span>
          )}
          {entry.durationMs != null && (
            <span>{((entry.durationMs as number) / 1000).toFixed(1)}s</span>
          )}
        </div>
      );

    case 'error':
      return (
        <div className="flex items-center gap-1.5 py-0.5">
          <span className="px-1.5 py-0.5 text-[10px] font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded">
            ERROR
          </span>
          <span className="text-[11px] text-red-600 dark:text-red-400 truncate">
            {entry.error as string}
          </span>
        </div>
      );

    case 'abort':
      return (
        <div className="flex items-center gap-1.5 py-0.5">
          <span className="px-1.5 py-0.5 text-[10px] font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded">
            ABORTED
          </span>
          <span className="text-[11px] text-gray-400">{formatTime(entry.ts)}</span>
        </div>
      );

    case 'status_change':
      return (
        <div className="flex items-center gap-1.5 py-0.5 text-[10px] text-gray-400 dark:text-gray-500">
          <span className="inline-block h-1 w-1 rounded-full bg-gray-300 dark:bg-gray-600" />
          <span>Status: {entry.status as string}</span>
          <span>{formatTime(entry.ts)}</span>
        </div>
      );

    case 'files_changed': {
      const files = (entry.files as string[]) ?? [];
      return (
        <div className="py-0.5">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          >
            <ChevronIcon expanded={expanded} />
            <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zm0 10.5a.75.75 0 01.75-.75h7.5a.75.75 0 010 1.5h-7.5a.75.75 0 01-.75-.75zM2 10a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 10z" clipRule="evenodd" />
            </svg>
            <span>{files.length} files changed</span>
          </button>
          {expanded && (
            <ul className="mt-1 ml-5 text-[11px] text-gray-500 dark:text-gray-400 space-y-0.5">
              {files.map((f) => (
                <li key={f} className="font-mono truncate">{f}</li>
              ))}
            </ul>
          )}
        </div>
      );
    }

    // Orphaned tool_result (no matching tool_use)
    case 'tool_result':
      return (
        <div className="py-0.5">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1.5 text-[11px] hover:text-gray-700 dark:hover:text-gray-300"
          >
            <ChevronIcon expanded={expanded} />
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400 shrink-0" />
            <span className="font-medium text-green-700 dark:text-green-400 font-mono">
              {entry.name as string}
            </span>
            <span className="text-gray-300 dark:text-gray-600 text-[10px]">result</span>
            <span className="text-gray-400 dark:text-gray-500">{formatTime(entry.ts)}</span>
          </button>
          {expanded && (
            <pre className="mt-1 ml-5 text-[11px] text-gray-600 dark:text-gray-300 whitespace-pre-wrap max-h-60 overflow-y-auto bg-green-50 dark:bg-green-900/10 rounded p-2 border border-green-100 dark:border-green-900/30">
              {truncateDisplay(entry.result as string)}
            </pre>
          )}
        </div>
      );

    default:
      return (
        <div className="text-[10px] text-gray-400 py-0.5">
          [{entry.type}] {formatTime(entry.ts)}
        </div>
      );
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`h-3 w-3 text-gray-400 transition-transform shrink-0 ${expanded ? 'rotate-90' : ''}`}
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
    </svg>
  );
}

function formatTime(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return ts;
  }
}

function formatJson(value: unknown): string {
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function truncateDisplay(text: string, max = 5000): string {
  return text.length > max ? text.slice(0, max) + '\n...[truncated]' : text;
}
