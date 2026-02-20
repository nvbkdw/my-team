import { useWorkerStore } from '../../stores/workerStore.js';
import { cn } from '../../utils/cn.js';

interface WorkerStatusBadgeProps {
  cardId: string;
  compact?: boolean;
}

const statusConfig = {
  none: { dot: 'bg-gray-300', label: 'No Worker', textColor: 'text-gray-500 dark:text-gray-400' },
  idle: { dot: 'bg-green-400', label: 'Ready', textColor: 'text-green-700 dark:text-green-400' },
  running: { dot: 'bg-blue-400 animate-pulse', label: 'Running', textColor: 'text-blue-700 dark:text-blue-400' },
  error: { dot: 'bg-red-400', label: 'Error', textColor: 'text-red-700 dark:text-red-400' },
};

export default function WorkerStatusBadge({ cardId, compact }: WorkerStatusBadgeProps) {
  const status = useWorkerStore((s) => s.statuses[cardId] || 'none');
  const config = statusConfig[status];

  if (compact) {
    return (
      <span
        className={cn('inline-block h-2 w-2 rounded-full', config.dot)}
        title={config.label}
      />
    );
  }

  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', config.textColor)}>
      <span className={cn('h-2 w-2 rounded-full', config.dot)} />
      {config.label}
    </span>
  );
}
