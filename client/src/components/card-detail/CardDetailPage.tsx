import { useCallback, useRef, useState } from 'react';
import { useUiStore } from '../../stores/uiStore.js';
import { useBoardStore } from '../../stores/boardStore.js';
import Spinner from '../ui/Spinner.js';
import CardDetailHeader from './CardDetailHeader.js';
import DetailsTab from './DetailsTab.js';
import PRDiffPanel from './PRDiffPanel.js';
import PreviewPanel from './PreviewPanel.js';

const MIN_LEFT_WIDTH = 320;
const MIN_RIGHT_WIDTH = 300;
const DEFAULT_LEFT_FRACTION = 0.4;

export default function CardDetailPage() {
  const selectedCardId = useUiStore((s) => s.selectedCardId);
  const cards = useBoardStore((s) => s.cards);
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftWidth, setLeftWidth] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [rightTab, setRightTab] = useState<'diff' | 'preview'>('diff');

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);

    const onMouseMove = (ev: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const totalWidth = rect.width;
      let newLeft = ev.clientX - rect.left;
      newLeft = Math.max(MIN_LEFT_WIDTH, Math.min(newLeft, totalWidth - MIN_RIGHT_WIDTH));
      setLeftWidth(newLeft);
    };

    const onMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, []);

  const card = selectedCardId
    ? cards.find((c) => c.id === selectedCardId) ?? null
    : null;

  if (!selectedCardId) return null;

  if (!card) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const resolvedLeftWidth = leftWidth ?? (containerRef.current
    ? containerRef.current.getBoundingClientRect().width * DEFAULT_LEFT_FRACTION
    : undefined);

  return (
    <div className="flex h-full flex-col bg-white dark:bg-gray-900">
      <CardDetailHeader card={card} />

      <div ref={containerRef} className="flex flex-1 overflow-hidden relative">
        {/* Left panel — details */}
        <div
          className="flex flex-col border-r border-gray-200 dark:border-gray-700"
          style={{ width: resolvedLeftWidth ?? '40%', minWidth: MIN_LEFT_WIDTH, flexShrink: 0 }}
        >
          <DetailsTab card={card} />
        </div>

        {/* Drag handle */}
        <div
          onMouseDown={handleMouseDown}
          className={`w-2 cursor-col-resize hover:bg-blue-400 active:bg-blue-500 transition-colors shrink-0
            ${isDragging ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-700'}`}
        />

        {/* Right panel — tabbed: Code Diff / Preview */}
        <div className="flex-1 flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-950" style={{ minWidth: MIN_RIGHT_WIDTH }}>
          {/* Tab bar */}
          <div className="shrink-0 flex border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
            <button
              onClick={() => setRightTab('diff')}
              className={`px-4 py-2 text-xs font-medium transition-colors relative ${
                rightTab === 'diff'
                  ? 'text-indigo-600 dark:text-indigo-400'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Code Diff
              {rightTab === 'diff' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-400" />
              )}
            </button>
            <button
              onClick={() => setRightTab('preview')}
              className={`px-4 py-2 text-xs font-medium transition-colors relative ${
                rightTab === 'preview'
                  ? 'text-indigo-600 dark:text-indigo-400'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Preview
              {rightTab === 'preview' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-400" />
              )}
            </button>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-hidden">
            {rightTab === 'diff' ? (
              <div className="h-full overflow-y-auto">
                <PRDiffPanel
                  cardId={card.id}
                  prNumber={card.pr_number}
                  branchName={card.branch_name}
                  hasBranch={!!card.branch_dir}
                />
              </div>
            ) : (
              <PreviewPanel
                cardId={card.id}
                hasBranch={!!card.branch_dir}
              />
            )}
          </div>
        </div>

        {/* Overlay to capture mouse events while dragging */}
        {isDragging && <div className="absolute inset-0 z-50 cursor-col-resize" />}
      </div>
    </div>
  );
}
