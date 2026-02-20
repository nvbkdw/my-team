import { useState, useEffect } from 'react';
import Dialog from '../ui/Dialog.js';
import Input from '../ui/Input.js';
import Button from '../ui/Button.js';
import { useUiStore } from '../../stores/uiStore.js';
import { fetchSettings, setSetting } from '../../api/settings.js';

export default function SettingsDialog() {
  const open = useUiStore((s) => s.isSettingsOpen);
  const close = useUiStore((s) => s.closeSettings);

  const [githubPat, setGithubPat] = useState('');
  const [maxWorkers, setMaxWorkers] = useState('2');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load current settings when dialog opens
  useEffect(() => {
    if (!open) return;
    fetchSettings()
      .then((entries) => {
        for (const entry of entries) {
          if (entry.key === 'github_pat') setGithubPat(entry.value);
          if (entry.key === 'max_workers') setMaxWorkers(entry.value);
        }
      })
      .catch(() => {
        // Settings may not exist yet, that's fine
      });
  }, [open]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await Promise.all([
        setSetting('github_pat', githubPat),
        setSetting('max_workers', maxWorkers),
      ]);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={close} title="Settings">
      <div className="space-y-4">
        <Input
          label="GitHub Personal Access Token"
          type="password"
          value={githubPat}
          onChange={(e) => setGithubPat(e.target.value)}
          placeholder="ghp_..."
        />

        <Input
          label="Max Workers"
          type="number"
          min={1}
          max={10}
          value={maxWorkers}
          onChange={(e) => setMaxWorkers(e.target.value)}
        />

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        {saved && (
          <p className="text-sm text-green-600">Settings saved.</p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="default" onClick={close}>
            Close
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
