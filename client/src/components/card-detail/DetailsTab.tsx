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
    <div className="space-y-6 p-6">
      {/* Labels */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700">
          Labels
        </label>
        <LabelManager cardId={card.id} />
      </div>

      {/* Description */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700">
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={handleDescriptionSave}
          placeholder="Add a description..."
          rows={5}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y"
        />
      </div>

      {/* Branch info */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700">
          Branch
        </label>
        <BranchInfo card={card} />
      </div>

      {/* Comments */}
      <CommentsList cardId={card.id} />
    </div>
  );
}
