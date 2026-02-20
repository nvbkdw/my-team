import { useState } from 'react';
import type { Card } from '../../types/models.js';
import { useBoardStore } from '../../stores/boardStore.js';
import { useRepoStore } from '../../stores/repoStore.js';
import { toBranchName } from '../../utils/branchNaming.js';
import Button from '../ui/Button.js';
import Input from '../ui/Input.js';
import Select from '../ui/Select.js';

interface BranchInfoProps {
  card: Card;
}

export default function BranchInfo({ card }: BranchInfoProps) {
  const updateCard = useBoardStore((s) => s.updateCard);
  const repos = useRepoStore((s) => s.repos);

  const [creating, setCreating] = useState(false);
  const [branchName, setBranchName] = useState(() =>
    toBranchName(card.title),
  );
  const [selectedRepoId, setSelectedRepoId] = useState(card.repo_id || '');
  const [submitting, setSubmitting] = useState(false);

  if (card.branch_name) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
        <div className="flex items-center gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4 text-gray-500"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M7.707 3.293a1 1 0 010 1.414L5.414 7H11a7 7 0 017 7v2a1 1 0 11-2 0v-2a5 5 0 00-5-5H5.414l2.293 2.293a1 1 0 11-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
          <code className="text-sm font-mono text-gray-700">
            {card.branch_name}
          </code>
        </div>
        {card.branch_dir && (
          <p className="mt-1 text-xs text-gray-500 truncate">
            {card.branch_dir}
          </p>
        )}
      </div>
    );
  }

  if (!creating) {
    return (
      <Button variant="default" size="sm" onClick={() => setCreating(true)}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="mr-1.5 h-3.5 w-3.5"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M7.707 3.293a1 1 0 010 1.414L5.414 7H11a7 7 0 017 7v2a1 1 0 11-2 0v-2a5 5 0 00-5-5H5.414l2.293 2.293a1 1 0 11-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
        Create Branch
      </Button>
    );
  }

  const repoOptions = repos.map((r) => ({ value: r.id, label: r.name }));

  const handleCreate = async () => {
    if (!branchName.trim()) return;
    setSubmitting(true);
    try {
      // First link the repo if one is selected
      if (selectedRepoId && selectedRepoId !== card.repo_id) {
        await updateCard(card.id, { repo_id: selectedRepoId });
      }

      // Call the branch creation API which creates worktree
      const res = await fetch(`/api/cards/${card.id}/branch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch_name: branchName.trim() }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to create branch' }));
        throw new Error(err.error);
      }

      const updatedCard = await res.json();
      // Update the card in the store with the response
      await updateCard(card.id, {
        branch_name: updatedCard.branch_name,
        branch_dir: updatedCard.branch_dir,
      });
      setCreating(false);
    } catch (err) {
      console.error('Failed to create branch:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
      <Input
        label="Branch Name"
        value={branchName}
        onChange={(e) => setBranchName(e.target.value)}
        placeholder="feature/my-branch"
      />
      {repoOptions.length > 0 && (
        <Select
          label="Repository"
          options={repoOptions}
          value={selectedRepoId}
          onChange={setSelectedRepoId}
          placeholder="Select a repo"
        />
      )}
      <div className="flex gap-2">
        <Button
          variant="primary"
          size="sm"
          onClick={handleCreate}
          disabled={submitting || !branchName.trim()}
        >
          {submitting ? 'Creating...' : 'Create'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCreating(false)}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
