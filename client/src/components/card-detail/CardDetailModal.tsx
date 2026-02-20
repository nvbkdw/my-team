import { useEffect } from 'react';
import { useUiStore, type ActiveTab } from '../../stores/uiStore.js';
import { useBoardStore } from '../../stores/boardStore.js';
import { useWebSocket } from '../../hooks/useWebSocket.js';
import Tabs from '../ui/Tabs.js';
import Spinner from '../ui/Spinner.js';
import CardDetailHeader from './CardDetailHeader.js';
import DetailsTab from './DetailsTab.js';
import CodeTab from './CodeTab.js';
import PRDiffTab from './PRDiffTab.js';
import AIChatTab from './AIChatTab.js';
import { cn } from '../../utils/cn.js';

const TABS: { key: ActiveTab; label: string }[] = [
  { key: 'details', label: 'Details' },
  { key: 'code', label: 'Code' },
  { key: 'pr', label: 'PR' },
  { key: 'chat', label: 'AI Chat' },
];

export default function CardDetailModal() {
  const selectedCardId = useUiStore((s) => s.selectedCardId);
  const activeTab = useUiStore((s) => s.activeTab);
  const setActiveTab = useUiStore((s) => s.setActiveTab);
  const closeCard = useUiStore((s) => s.closeCard);
  const cards = useBoardStore((s) => s.cards);

  const card = selectedCardId
    ? cards.find((c) => c.id === selectedCardId) ?? null
    : null;

  // Close on Escape
  useEffect(() => {
    if (!selectedCardId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeCard();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedCardId, closeCard]);

  // Prevent body scroll when open
  useEffect(() => {
    if (selectedCardId) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [selectedCardId]);

  if (!selectedCardId) return null;

  return (
    <div className="fixed inset-0 z-40">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 transition-opacity"
        onClick={closeCard}
      />

      {/* Slide-over panel */}
      <div
        className={cn(
          'absolute right-0 top-0 bottom-0 w-full max-w-2xl bg-white shadow-2xl',
          'flex flex-col',
          'animate-[slideInRight_200ms_ease-out]',
        )}
      >
        {/* Close button */}
        <button
          onClick={closeCard}
          className="absolute right-4 top-4 z-10 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        {!card ? (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <>
            <CardDetailHeader card={card} />
            <Tabs
              tabs={TABS}
              activeKey={activeTab}
              onChange={(key) => setActiveTab(key as ActiveTab)}
            />
            <div className="flex-1 overflow-y-auto">
              {activeTab === 'details' && <DetailsTab card={card} />}
              {activeTab === 'code' && (
                <CodeTab cardId={card.id} hasBranch={!!card.branch_dir} />
              )}
              {activeTab === 'pr' && (
                <PRDiffTab
                  cardId={card.id}
                  prNumber={card.pr_number}
                  branchName={card.branch_name}
                />
              )}
              {activeTab === 'chat' && (
                <AIChatTab cardId={card.id} />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
