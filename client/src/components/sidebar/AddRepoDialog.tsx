import { useState } from 'react';
import Dialog from '../ui/Dialog.js';
import Input from '../ui/Input.js';
import Button from '../ui/Button.js';
import { useUiStore } from '../../stores/uiStore.js';
import { useRepoStore } from '../../stores/repoStore.js';

export default function AddRepoDialog() {
  const open = useUiStore((s) => s.isAddRepoDialogOpen);
  const close = useUiStore((s) => s.closeAddRepoDialog);
  const addRepo = useRepoStore((s) => s.addRepo);

  const [name, setName] = useState('');
  const [localPath, setLocalPath] = useState('');
  const [githubOwner, setGithubOwner] = useState('');
  const [githubRepo, setGithubRepo] = useState('');
  const [defaultBranch, setDefaultBranch] = useState('main');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !localPath.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      await addRepo({
        name: name.trim(),
        local_path: localPath.trim(),
        github_owner: githubOwner.trim() || undefined,
        github_repo: githubRepo.trim() || undefined,
        default_branch: defaultBranch.trim() || 'main',
      });
      resetAndClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const resetAndClose = () => {
    setName('');
    setLocalPath('');
    setGithubOwner('');
    setGithubRepo('');
    setDefaultBranch('main');
    setError(null);
    close();
  };

  return (
    <Dialog open={open} onClose={resetAndClose} title="Add Repository">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="my-project"
          required
        />
        <Input
          label="Local Path"
          value={localPath}
          onChange={(e) => setLocalPath(e.target.value)}
          placeholder="/Users/you/projects/my-project"
          required
        />
        <Input
          label="GitHub Owner (optional)"
          value={githubOwner}
          onChange={(e) => setGithubOwner(e.target.value)}
          placeholder="octocat"
        />
        <Input
          label="GitHub Repo (optional)"
          value={githubRepo}
          onChange={(e) => setGithubRepo(e.target.value)}
          placeholder="my-project"
        />
        <Input
          label="Default Branch"
          value={defaultBranch}
          onChange={(e) => setDefaultBranch(e.target.value)}
          placeholder="main"
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
            disabled={submitting || !name.trim() || !localPath.trim()}
          >
            {submitting ? 'Adding...' : 'Add Repo'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
