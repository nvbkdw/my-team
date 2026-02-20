import { useState, useEffect } from 'react';
import type { Card } from '../../types/models.js';
import { useBoardStore } from '../../stores/boardStore.js';
import BranchInfo from './BranchInfo.js';
import LabelManager from './LabelManager.js';
import CommentsList from './CommentsList.js';

interface DetailsTabProps {
  card: Card;
}

export default function DetailsTab({ card }: DetailsTabProps) {
  const updateCard = useBoardStore((s) => s.updateCard);
  const [description, setDescription] = useState(card.description);

  useEffect(() => {
    setDescription(card.description);
  }, [card.description]);

  const handleDescriptionSave = () => {
    if (description !== card.description) {
      updateCard(card.id, { description });
    }
  };

  const [metadataOpen, setMetadataOpen] = useState(true);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Labels */}
      <div className="overflow-y-auto px-6 py-4 space-y-6">
        <LabelManager cardId={card.id} />
      </div>
      {/* Card metadata — collapsible */}
      <button
        type="button"
        onClick={() => setMetadataOpen((o) => !o)}
        className="flex items-center gap-1.5 px-6 pt-4 pb-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
      >
        <svg
          className={`w-3.5 h-3.5 transition-transform ${metadataOpen ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        Spec
      </button>

      {metadataOpen && (
        <div className="overflow-y-auto px-6 pb-4 space-y-6">

          {/* Description */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={handleDescriptionSave}
              placeholder="Add a description..."
              rows={5}
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y"
            />
          </div>

          {/* Branch info */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Branch
            </label>
            <BranchInfo card={card} />
          </div>
        </div>
      )}

      {/* Comments — fills remaining space, input pinned at bottom */}
      <CommentsList cardId={card.id} />
    </div>
  );
}
