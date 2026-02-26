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
  backlog: { label: 'Backlog', color: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300' },
  priority: { label: 'Priority', color: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' },
  in_progress: { label: 'In Progress', color: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' },
  done: { label: 'Done', color: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' },
};

const allStatuses: CardStatus[] = ['backlog', 'priority', 'in_progress', 'done'];

export default function CardDetailHeader({ card }: CardDetailHeaderProps) {
  const updateCard = useBoardStore((s) => s.updateCard);
  const removeCard = useBoardStore((s) => s.removeCard);
  const closeCardAction = useBoardStore((s) => s.closeCard);
  const closeCardView = useUiStore((s) => s.closeCard);

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(card.title);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTitle(card.title);
  }, [card.title]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

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

  const handleClose = async () => {
    if (!confirmClose) {
      setConfirmClose(true);
      return;
    }
    await closeCardAction(card.id);
    closeCardView();
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await removeCard(card.id);
    closeCardView();
  };

  const cfg = statusConfig[card.status];

  return (
    <div className="flex items-center gap-3 border-b border-gray-200 dark:border-gray-700 px-6 py-3 bg-white dark:bg-gray-900">
      {/* Back arrow */}
      <button
        onClick={closeCardView}
        className="rounded-md p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
        title="Back to board"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {/* Title */}
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
            className="w-full rounded-md border border-indigo-300 dark:border-indigo-600 bg-white dark:bg-gray-800 px-2 py-1 text-lg font-semibold text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        ) : (
          <h2
            onClick={() => setEditing(true)}
            className="cursor-pointer truncate text-lg font-semibold text-gray-900 dark:text-gray-100 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
            title="Click to edit"
          >
            {card.title}
          </h2>
        )}
      </div>

      {/* Status badge */}
      <div className="relative" ref={statusRef}>
        <button onClick={() => setShowStatusMenu(!showStatusMenu)}>
          <Badge color={cfg.color}>{cfg.label}</Badge>
        </button>

        {showStatusMenu && (
          <div className="absolute right-0 top-8 z-20 w-40 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 py-1 shadow-lg">
            {allStatuses.map((s) => (
              <button
                key={s}
                onClick={() => handleStatusChange(s)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
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

      {/* Close (cleanup worktree + PR, move to done) */}
      {card.status !== 'done' && (
        <Button
          variant={confirmClose ? 'danger' : 'ghost'}
          size="sm"
          onClick={handleClose}
          onBlur={() => setConfirmClose(false)}
        >
          {confirmClose ? 'Confirm?' : 'Close'}
        </Button>
      )}

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
