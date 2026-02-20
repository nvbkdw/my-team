import { useState, useRef, useEffect } from 'react';
import type { Card, CardStatus } from '../../types/models.js';
import { useBoardStore } from '../../stores/boardStore.js';
import { useUiStore } from '../../stores/uiStore.js';
import Badge from '../ui/Badge.js';
import Button from '../ui/Button.js';

interface CardDetailHeaderProps {
  card: Card;
}

const statusConfig: Record<CardStatus, { label: string; color: string }> = {
  backlog: { label: 'Backlog', color: 'bg-gray-100 text-gray-700' },
  priority: { label: 'Priority', color: 'bg-amber-100 text-amber-700' },
  in_progress: { label: 'In Progress', color: 'bg-blue-100 text-blue-700' },
  done: { label: 'Done', color: 'bg-green-100 text-green-700' },
};

const allStatuses: CardStatus[] = ['backlog', 'priority', 'in_progress', 'done'];

export default function CardDetailHeader({ card }: CardDetailHeaderProps) {
  const updateCard = useBoardStore((s) => s.updateCard);
  const removeCard = useBoardStore((s) => s.removeCard);
  const closeCard = useUiStore((s) => s.closeCard);

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(card.title);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTitle(card.title);
  }, [card.title]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  // Close status menu on outside click
  useEffect(() => {
    if (!showStatusMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) {
        setShowStatusMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showStatusMenu]);

  const handleTitleSave = () => {
    setEditing(false);
    if (title.trim() && title.trim() !== card.title) {
      updateCard(card.id, { title: title.trim() });
    } else {
      setTitle(card.title);
    }
  };

  const handleStatusChange = (status: CardStatus) => {
    setShowStatusMenu(false);
    if (status !== card.status) {
      updateCard(card.id, { status });
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await removeCard(card.id);
    closeCard();
  };

  const cfg = statusConfig[card.status];

  return (
    <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-6 py-4">
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            ref={inputRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleTitleSave}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleTitleSave();
              if (e.key === 'Escape') {
                setTitle(card.title);
                setEditing(false);
              }
            }}
            className="w-full rounded-md border border-indigo-300 px-2 py-1 text-lg font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        ) : (
          <h2
            onClick={() => setEditing(true)}
            className="cursor-pointer truncate text-lg font-semibold text-gray-900 hover:text-indigo-600 transition-colors"
            title="Click to edit"
          >
            {card.title}
          </h2>
        )}

        {/* Status badge */}
        <div className="relative mt-2" ref={statusRef}>
          <button onClick={() => setShowStatusMenu(!showStatusMenu)}>
            <Badge color={cfg.color}>{cfg.label}</Badge>
          </button>

          {showStatusMenu && (
            <div className="absolute left-0 top-8 z-20 w-40 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
              {allStatuses.map((s) => (
                <button
                  key={s}
                  onClick={() => handleStatusChange(s)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      s === 'backlog'
                        ? 'bg-gray-400'
                        : s === 'priority'
                          ? 'bg-amber-400'
                          : s === 'in_progress'
                            ? 'bg-blue-500'
                            : 'bg-green-500'
                    }`}
                  />
                  {statusConfig[s].label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete */}
      <Button
        variant={confirmDelete ? 'danger' : 'ghost'}
        size="sm"
        onClick={handleDelete}
        onBlur={() => setConfirmDelete(false)}
      >
        {confirmDelete ? 'Confirm?' : 'Delete'}
      </Button>
    </div>
  );
}
