import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Card } from '../../types/models.js';
import { useUiStore } from '../../stores/uiStore.js';
import { useRepoStore } from '../../stores/repoStore.js';
import { cn } from '../../utils/cn.js';

interface CardTileProps {
  card: Card;
}

const statusBorderColors: Record<string, string> = {
  backlog: 'border-l-gray-400',
  priority: 'border-l-amber-400',
  in_progress: 'border-l-blue-500',
  done: 'border-l-green-500',
};

export default function CardTile({ card }: CardTileProps) {
  const selectCard = useUiStore((s) => s.selectCard);
  const repos = useRepoStore((s) => s.repos);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const repo = card.repo_id
    ? repos.find((r) => r.id === card.repo_id)
    : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => selectCard(card.id)}
      className={cn(
        'cursor-pointer rounded-lg border-l-[3px] bg-white p-3 shadow-sm',
        'hover:shadow-md transition-shadow',
        statusBorderColors[card.status] || 'border-l-gray-300',
        isDragging && 'opacity-50 shadow-lg',
      )}
    >
      <p className="text-sm font-medium text-gray-900 leading-snug">
        {card.title}
      </p>
      {card.description && (
        <p className="mt-1 text-xs text-gray-500 line-clamp-2">
          {card.description}
        </p>
      )}
      {repo && (
        <div className="mt-2 flex items-center gap-1">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-3 w-3 text-gray-400"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M2 6a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1H8a3 3 0 00-3 3v1.5a1.5 1.5 0 01-3 0V6z"
              clipRule="evenodd"
            />
            <path d="M6 12a2 2 0 012-2h8a2 2 0 012 2v2a2 2 0 01-2 2H2h2a2 2 0 002-2v-2z" />
          </svg>
          <span className="text-xs text-gray-400">{repo.name}</span>
        </div>
      )}
    </div>
  );
}
