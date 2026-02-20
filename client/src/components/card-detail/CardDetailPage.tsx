import { useUiStore } from '../../stores/uiStore.js';
import { useBoardStore } from '../../stores/boardStore.js';
import Spinner from '../ui/Spinner.js';
import CardDetailHeader from './CardDetailHeader.js';
import DetailsTab from './DetailsTab.js';
import PRDiffPanel from './PRDiffPanel.js';

export default function CardDetailPage() {
  const selectedCardId = useUiStore((s) => s.selectedCardId);
  const cards = useBoardStore((s) => s.cards);

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

  return (
    <div className="flex h-full flex-col bg-white">
      <CardDetailHeader card={card} />

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — details */}
        <div className="w-2/5 min-w-[320px] overflow-y-auto border-r border-gray-200">
          <DetailsTab card={card} />
        </div>

        {/* Right panel — branch diff */}
        <div className="flex-1 overflow-y-auto bg-gray-50">
          <PRDiffPanel
            cardId={card.id}
            prNumber={card.pr_number}
            branchName={card.branch_name}
            hasBranch={!!card.branch_dir}
          />
        </div>
      </div>
    </div>
  );
}
