import { useState, useEffect } from 'react';
import { apiFetch } from '../../api/client.js';
import type { CardLabel } from '../../types/models.js';
import Button from '../ui/Button.js';

interface LabelManagerProps {
  cardId: string;
}

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#6366f1', '#a855f7',
  '#ec4899', '#64748b',
];

export default function LabelManager({ cardId }: LabelManagerProps) {
  const [labels, setLabels] = useState<CardLabel[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[6]);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    loadLabels();
  }, [cardId]);

  const loadLabels = async () => {
    try {
      const data = await apiFetch<CardLabel[]>(`/cards/${cardId}/labels`);
      setLabels(data);
    } catch {
      // Labels endpoint might not exist yet
    }
  };

  const handleAdd = async () => {
    if (!newLabel.trim()) return;
    try {
      const label = await apiFetch<CardLabel>(`/cards/${cardId}/labels`, {
        method: 'POST',
        body: JSON.stringify({ label: newLabel.trim(), color: selectedColor }),
      });
      setLabels((prev) => [...prev, label]);
      setNewLabel('');
      setShowAdd(false);
    } catch {
      // Handle error silently
    }
  };

  const handleRemove = async (labelId: string) => {
    try {
      await apiFetch(`/cards/${cardId}/labels/${labelId}`, { method: 'DELETE' });
      setLabels((prev) => prev.filter((l) => l.id !== labelId));
    } catch {
      // Handle error silently
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        {labels.map((label) => (
          <span
            key={label.id}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
            style={{ backgroundColor: label.color }}
          >
            {label.label}
            <button
              onClick={() => handleRemove(label.id)}
              className="ml-0.5 opacity-70 hover:opacity-100"
            >
              x
            </button>
          </span>
        ))}
        {!showAdd && (
          <button
            onClick={() => setShowAdd(true)}
            className="text-xs text-indigo-600 hover:underline"
          >
            + Add label
          </button>
        )}
      </div>

      {showAdd && (
        <div className="flex items-center gap-2">
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Label name"
            className="rounded border border-gray-300 px-2 py-1 text-xs w-24 focus:border-indigo-500 focus:outline-none"
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <div className="flex gap-1">
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => setSelectedColor(color)}
                className="h-4 w-4 rounded-full border-2"
                style={{
                  backgroundColor: color,
                  borderColor: color === selectedColor ? '#1f2937' : 'transparent',
                }}
              />
            ))}
          </div>
          <Button variant="primary" size="sm" onClick={handleAdd}>
            Add
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
