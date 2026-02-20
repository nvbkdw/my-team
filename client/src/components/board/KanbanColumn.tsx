import { useState, useRef, useEffect } from 'react';
import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { Card, CardStatus } from '../../types/models.js';
import { useBoardStore } from '../../stores/boardStore.js';
import { useRepoStore } from '../../stores/repoStore.js';
import { toBranchName } from '../../utils/branchNaming.js';
import CardTile from './CardTile.js';
import { cn } from '../../utils/cn.js';

interface KanbanColumnProps {
  status: CardStatus;
  title: string;
  cards: Card[];
}

const columnHeaderColors: Record<CardStatus, string> = {
  backlog: 'text-gray-600 dark:text-gray-400',
  priority: 'text-amber-600 dark:text-amber-400',
  in_progress: 'text-blue-600 dark:text-blue-400',
  done: 'text-green-600 dark:text-green-400',
};

const columnDotColors: Record<CardStatus, string> = {
  backlog: 'bg-gray-400',
  priority: 'bg-amber-400',
  in_progress: 'bg-blue-500',
  done: 'bg-green-500',
};

export default function KanbanColumn({ status, title, cards }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const addCard = useBoardStore((s) => s.addCard);
  const updateCard = useBoardStore((s) => s.updateCard);
  const repos = useRepoStore((s) => s.repos);

  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [repoId, setRepoId] = useState('');
  const [branchName, setBranchName] = useState('');
  const [showBranch, setShowBranch] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isAdding) inputRef.current?.focus();
  }, [isAdding]);

  // Auto-generate branch name from title
  useEffect(() => {
    if (showBranch && newTitle.trim()) {
      setBranchName(toBranchName(newTitle));
    }
  }, [newTitle, showBranch]);

  const resetForm = () => {
    setIsAdding(false);
    setNewTitle('');
    setRepoId('');
    setBranchName('');
    setShowBranch(false);
    setSubmitting(false);
  };

  const handleSubmit = async () => {
    const trimmed = newTitle.trim();
    if (!trimmed) {
      resetForm();
      return;
    }

    setSubmitting(true);
    try {
      const card = await addCard({
        title: trimmed,
        status,
        repo_id: repoId || undefined,
      });

      // Create branch if section was expanded and a repo is selected
      if (showBranch && repoId && branchName.trim()) {
        const res = await fetch(`/api/cards/${card.id}/branch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ branch_name: branchName.trim() }),
        });
        if (res.ok) {
          const updated = await res.json();
          await updateCard(card.id, {
            branch_name: updated.branch_name,
            branch_dir: updated.branch_dir,
          });
        }
      }

      // Reset for next entry
      setNewTitle('');
      setBranchName('');
      setSubmitting(false);
      inputRef.current?.focus();
    } catch {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      resetForm();
    }
  };

  const cardIds = cards.map((c) => c.id);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-col rounded-xl bg-gray-100/80 dark:bg-gray-800/80 min-h-[calc(100vh-8rem)]',
        'w-full min-w-[260px]',
        isOver && 'ring-2 ring-indigo-300 dark:ring-indigo-600 bg-indigo-50/40 dark:bg-indigo-900/40',
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
        <span className="ml-auto rounded-full bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 text-xs font-medium text-gray-600 dark:text-gray-300">
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
          <div className="flex items-center justify-center rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 py-8 text-xs text-gray-400 dark:text-gray-500">
            Drop cards here
          </div>
        )}
      </div>

      {/* Add item */}
      <div className="px-2 pb-3">
        {isAdding ? (
          <div className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800/90 p-2.5 space-y-2">
            <input
              ref={inputRef}
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Card title..."
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />

            {/* Branch section toggle */}
            <button
              type="button"
              onClick={() => setShowBranch(!showBranch)}
              className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className={cn('h-3 w-3 transition-transform', showBranch && 'rotate-90')}
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
              </svg>
              Branch
            </button>

            {showBranch && (
              <div className="rounded-md border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 p-2.5 space-y-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Branch Name</label>
                  <input
                    value={branchName}
                    onChange={(e) => setBranchName(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="feature/my-branch"
                    className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                {repos.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Repository</label>
                    <select
                      value={repoId}
                      onChange={(e) => setRepoId(e.target.value)}
                      className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="">Select a repo</option>
                      {repos.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleSubmit}
                disabled={submitting || !newTitle.trim()}
                className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? 'Creating...' : 'Create'}
              </button>
              <button
                onClick={resetForm}
                className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setIsAdding(true)}
            className="flex w-full items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-200/80 dark:hover:bg-gray-700/80 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            <span className="text-base leading-none">+</span>
            Add item
          </button>
        )}
      </div>
    </div>
  );
}
