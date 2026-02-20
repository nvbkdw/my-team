import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { Card, CardStatus } from '../../types/models.js';
import CardTile from './CardTile.js';
import { cn } from '../../utils/cn.js';

interface KanbanColumnProps {
  status: CardStatus;
  title: string;
  cards: Card[];
}

const columnHeaderColors: Record<CardStatus, string> = {
  backlog: 'text-gray-600',
  priority: 'text-amber-600',
  in_progress: 'text-blue-600',
  done: 'text-green-600',
};

const columnDotColors: Record<CardStatus, string> = {
  backlog: 'bg-gray-400',
  priority: 'bg-amber-400',
  in_progress: 'bg-blue-500',
  done: 'bg-green-500',
};

export default function KanbanColumn({ status, title, cards }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  const cardIds = cards.map((c) => c.id);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-col rounded-xl bg-gray-100/80 min-h-[calc(100vh-8rem)]',
        'w-full min-w-[260px]',
        isOver && 'ring-2 ring-indigo-300 bg-indigo-50/40',
      )}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 px-3 py-3">
        <span
          className={cn('h-2 w-2 rounded-full', columnDotColors[status])}
        />
        <h3
          className={cn(
            'text-sm font-semibold',
            columnHeaderColors[status],
          )}
        >
          {title}
        </h3>
        <span className="ml-auto rounded-full bg-gray-200 px-1.5 py-0.5 text-xs font-medium text-gray-600">
          {cards.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex-1 space-y-2 px-2 pb-3">
        <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <CardTile key={card.id} card={card} />
          ))}
        </SortableContext>

        {cards.length === 0 && (
          <div className="flex items-center justify-center rounded-lg border-2 border-dashed border-gray-300 py-8 text-xs text-gray-400">
            Drop cards here
          </div>
        )}
      </div>
    </div>
  );
}
