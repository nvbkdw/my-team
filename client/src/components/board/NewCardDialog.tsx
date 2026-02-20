import { useState } from 'react';
import Dialog from '../ui/Dialog.js';
import Input from '../ui/Input.js';
import Select from '../ui/Select.js';
import Button from '../ui/Button.js';
import { useUiStore } from '../../stores/uiStore.js';
import { useBoardStore } from '../../stores/boardStore.js';
import { useRepoStore } from '../../stores/repoStore.js';
import type { CardStatus } from '../../types/models.js';

const statusOptions = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'priority', label: 'Priority' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
];

export default function NewCardDialog() {
  const open = useUiStore((s) => s.isNewCardDialogOpen);
  const close = useUiStore((s) => s.closeNewCardDialog);
  const addCard = useBoardStore((s) => s.addCard);
  const repos = useRepoStore((s) => s.repos);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<CardStatus>('backlog');
  const [repoId, setRepoId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      await addCard({
        title: title.trim(),
        description: description.trim() || undefined,
        status,
        repo_id: repoId || undefined,
      });
      resetAndClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const resetAndClose = () => {
    setTitle('');
    setDescription('');
    setStatus('backlog');
    setRepoId('');
    setError(null);
    close();
  };

  const repoOptions = [
    { value: '', label: 'None' },
    ...repos.map((r) => ({ value: r.id, label: r.name })),
  ];

  return (
    <Dialog open={open} onClose={resetAndClose} title="New Card">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Card title"
          required
          autoFocus
        />

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description..."
            rows={3}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
          />
        </div>

        <Select
          label="Status"
          options={statusOptions}
          value={status}
          onChange={(v) => setStatus(v as CardStatus)}
        />

        <Select
          label="Repository (optional)"
          options={repoOptions}
          value={repoId}
          onChange={setRepoId}
        />

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="default" onClick={resetAndClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={submitting || !title.trim()}
          >
            {submitting ? 'Creating...' : 'Create Card'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
