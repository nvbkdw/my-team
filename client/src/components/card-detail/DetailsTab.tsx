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

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Card metadata — scrollable */}
      <div className="overflow-y-auto p-6 space-y-6">
        {/* Labels */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Labels
          </label>
          <LabelManager cardId={card.id} />
        </div>

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

      {/* Comments — fills remaining space, input pinned at bottom */}
      <CommentsList cardId={card.id} />
    </div>
  );
}
