import { useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { useBoardStore } from '../../stores/boardStore.js';
import type { Card, CardStatus } from '../../types/models.js';
import KanbanColumn from './KanbanColumn.js';
import BoardHeader from './BoardHeader.js';
import Spinner from '../ui/Spinner.js';

const COLUMNS: { status: CardStatus; title: string }[] = [
  { status: 'backlog', title: 'Backlog' },
  { status: 'priority', title: 'Priority' },
  { status: 'in_progress', title: 'In Progress' },
  { status: 'done', title: 'Done' },
];

function cardsByStatus(cards: Card[], status: CardStatus): Card[] {
  return cards
    .filter((c) => c.status === status)
    .sort((a, b) => a.position - b.position);
}

export default function KanbanBoard() {
  const fetchCards = useBoardStore((s) => s.fetchCards);
  const loading = useBoardStore((s) => s.loading);
  const error = useBoardStore((s) => s.error);
  const cards = useBoardStore((s) => s.cards);
  const moveCard = useBoardStore((s) => s.moveCard);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  useEffect(() => {
    fetchCards();
  }, [fetchCards]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const cardId = active.id as string;
    const overId = over.id as string;

    // Determine the target status.
    // If dropped on a column (the column id is the status string), use that.
    // If dropped on another card, find that card's status.
    let targetStatus: CardStatus;
    let targetPosition: number;

    const isColumnDrop = COLUMNS.some((col) => col.status === overId);

    if (isColumnDrop) {
      targetStatus = overId as CardStatus;
      const columnCards = cardsByStatus(useBoardStore.getState().cards, targetStatus);
      targetPosition = columnCards.length; // append at end
    } else {
      // Dropped on or near another card
      const allCards = useBoardStore.getState().cards;
      const overCard = allCards.find((c) => c.id === overId);
      if (!overCard) return;

      targetStatus = overCard.status;
      const columnCards = cardsByStatus(useBoardStore.getState().cards, targetStatus);
      const overIndex = columnCards.findIndex((c) => c.id === overId);
      targetPosition = overIndex >= 0 ? overIndex : columnCards.length;
    }

    // Only move if something actually changed
    const currentCard = useBoardStore.getState().cards.find((c) => c.id === cardId);
    if (!currentCard) return;
    if (currentCard.status === targetStatus && currentCard.position === targetPosition) return;

    moveCard(cardId, targetStatus, targetPosition);
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <p className="text-sm text-red-600">Failed to load cards: {error}</p>
        <button
          onClick={fetchCards}
          className="text-sm text-indigo-600 hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <BoardHeader />
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <div className="flex flex-1 gap-4 overflow-x-auto px-6 pb-6">
          {COLUMNS.map((col) => (
            <KanbanColumn
              key={col.status}
              status={col.status}
              title={col.title}
              cards={cardsByStatus(cards, col.status)}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}
