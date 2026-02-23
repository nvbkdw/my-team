import { useState, useEffect, useRef, useCallback } from 'react';
import type { Subtask } from '../../types/models.js';
import {
  fetchSubtasks,
  createSubtask,
  updateSubtask,
  deleteSubtask,
} from '../../api/subtasks.js';

interface SubtaskListProps {
  cardId: string;
}

interface SubtaskNode extends Subtask {
  children: SubtaskNode[];
}

function buildTree(items: Subtask[]): SubtaskNode[] {
  const map = new Map<string, SubtaskNode>();
  const roots: SubtaskNode[] = [];
  for (const item of items) map.set(item.id, { ...item, children: [] });
  for (const node of map.values()) {
    if (node.parent_id && map.has(node.parent_id)) {
      map.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  for (const node of map.values())
    node.children.sort((a, b) => a.position - b.position);
  roots.sort((a, b) => a.position - b.position);
  return roots;
}

function countCompleted(nodes: SubtaskNode[]): { total: number; done: number } {
  let total = 0;
  let done = 0;
  for (const node of nodes) {
    total++;
    if (node.completed) done++;
    const child = countCompleted(node.children);
    total += child.total;
    done += child.done;
  }
  return { total, done };
}

export default function SubtaskList({ cardId }: SubtaskListProps) {
  const [items, setItems] = useState<Subtask[]>([]);
  const [sectionOpen, setSectionOpen] = useState(true);
  const [hideCompleted, setHideCompleted] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [addingChildOf, setAddingChildOf] = useState<string | null>(null);

  useEffect(() => {
    loadSubtasks();
  }, [cardId]);

  const loadSubtasks = async () => {
    try {
      const data = await fetchSubtasks(cardId);
      setItems(data);
    } catch {
      // endpoint may not exist yet
    }
  };

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleCreate = async (title: string, parentId?: string | null) => {
    try {
      const created = await createSubtask(cardId, {
        title,
        parent_id: parentId ?? null,
      });
      setItems((prev) => [...prev, created]);
      // Auto-expand parent so the new child is visible
      if (parentId) {
        setExpandedIds((prev) => new Set(prev).add(parentId));
      }
    } catch {
      // silent
    }
  };

  const handleToggle = async (subtask: Subtask) => {
    const newVal = subtask.completed ? 0 : 1;
    try {
      const updated = await updateSubtask(cardId, subtask.id, {
        completed: newVal,
      });
      setItems((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    } catch {
      // silent
    }
  };

  const handleRename = async (subtask: Subtask, newTitle: string) => {
    if (!newTitle.trim() || newTitle === subtask.title) return;
    try {
      const updated = await updateSubtask(cardId, subtask.id, {
        title: newTitle.trim(),
      });
      setItems((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    } catch {
      // silent
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteSubtask(cardId, id);
      setItems((prev) => {
        const removedIds = new Set<string>();
        const collectDescendants = (parentId: string) => {
          removedIds.add(parentId);
          for (const item of prev) {
            if (item.parent_id === parentId) collectDescendants(item.id);
          }
        };
        collectDescendants(id);
        return prev.filter((s) => !removedIds.has(s.id));
      });
    } catch {
      // silent
    }
  };

  const tree = buildTree(items);
  const { total, done } = countCompleted(tree);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setSectionOpen((o) => !o)}
          className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
        >
          <svg
            className={`w-3.5 h-3.5 transition-transform ${sectionOpen ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          Tasks
        </button>
        {total > 0 && (
          <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
            {done}/{total}
          </span>
        )}
        <div className="flex-1" />
        {total > 0 && (
          <button
            type="button"
            onClick={() => setHideCompleted((h) => !h)}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            {hideCompleted ? 'Show completed' : 'Hide completed'}
          </button>
        )}
      </div>

      {sectionOpen && (
        <div className="mt-2">
          {tree.map((node) => (
            <SubtaskItem
              key={node.id}
              node={node}
              depth={0}
              hideCompleted={hideCompleted}
              expandedIds={expandedIds}
              addingChildOf={addingChildOf}
              onToggleExpand={toggleExpanded}
              onToggle={handleToggle}
              onRename={handleRename}
              onDelete={handleDelete}
              onCreate={handleCreate}
              onStartAddChild={setAddingChildOf}
            />
          ))}
          <div className="pl-[26px]">
            <InlineAdd
              onAdd={(title) => handleCreate(title)}
              placeholder="Add sub-task..."
            />
          </div>
        </div>
      )}
    </div>
  );
}

// --- SubtaskItem ---

interface SubtaskItemProps {
  node: SubtaskNode;
  depth: number;
  hideCompleted: boolean;
  expandedIds: Set<string>;
  addingChildOf: string | null;
  onToggleExpand: (id: string) => void;
  onToggle: (s: Subtask) => void;
  onRename: (s: Subtask, title: string) => void;
  onDelete: (id: string) => void;
  onCreate: (title: string, parentId?: string | null) => void;
  onStartAddChild: (id: string | null) => void;
}

function SubtaskItem({
  node,
  depth,
  hideCompleted,
  expandedIds,
  addingChildOf,
  onToggleExpand,
  onToggle,
  onRename,
  onDelete,
  onCreate,
  onStartAddChild,
}: SubtaskItemProps) {
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(node.title);
  const inputRef = useRef<HTMLInputElement>(null);

  if (hideCompleted && node.completed) return null;

  const completed = !!node.completed;
  const hasChildren = node.children.length > 0;
  const expanded = expandedIds.has(node.id);
  const isAddingChild = addingChildOf === node.id;

  const startEdit = () => {
    setEditVal(node.title);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const commitEdit = () => {
    setEditing(false);
    onRename(node, editVal);
  };

  const handleAddChild = () => {
    // If has children but collapsed, expand so children are visible alongside the input
    if (hasChildren && !expanded) onToggleExpand(node.id);
    onStartAddChild(node.id);
  };

  const showChildArea = expanded || isAddingChild;

  return (
    <div>
      <div className="group flex items-center gap-1.5 py-1 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800/50 -mx-1 px-1">
        {/* Expand chevron — only for items with children */}
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggleExpand(node.id)}
            className="flex-shrink-0 w-4 h-4 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <svg
              className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ) : (
          <span className="w-4 flex-shrink-0" />
        )}

        {/* Radio checkbox */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggle(node); }}
          className="flex-shrink-0 w-4 h-4 flex items-center justify-center"
        >
          <span
            className={`block w-3.5 h-3.5 rounded-full border-2 transition-colors ${
              completed
                ? 'border-indigo-500 bg-indigo-500'
                : 'border-gray-400 dark:border-gray-500 bg-transparent'
            }`}
          >
            {completed && (
              <span className="block w-full h-full rounded-full flex items-center justify-center">
                <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 6l2.5 2.5 4.5-5" />
                </svg>
              </span>
            )}
          </span>
        </button>

        {/* Title — click to expand (if has children), double-click to edit */}
        {editing ? (
          <input
            ref={inputRef}
            value={editVal}
            onChange={(e) => setEditVal(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitEdit();
              if (e.key === 'Escape') setEditing(false);
            }}
            className="flex-1 min-w-0 text-sm bg-transparent border-b border-indigo-400 outline-none text-gray-900 dark:text-gray-100 py-0"
          />
        ) : (
          <span
            onClick={() => { if (hasChildren) onToggleExpand(node.id); }}
            onDoubleClick={startEdit}
            className={`flex-1 min-w-0 text-sm truncate select-none ${
              hasChildren ? 'cursor-pointer' : 'cursor-default'
            } ${
              completed
                ? 'line-through text-gray-400 dark:text-gray-500'
                : 'text-gray-800 dark:text-gray-200'
            }`}
          >
            {node.title}
            {hasChildren && !expanded && (
              <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500 font-normal">
                ({node.children.length})
              </span>
            )}
          </span>
        )}

        {/* Action buttons — + then x */}
        <button
          type="button"
          onClick={handleAddChild}
          className="flex-shrink-0 opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center text-gray-400 hover:text-indigo-500 transition-opacity"
          title="Add nested sub-task"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => onDelete(node.id)}
          className="flex-shrink-0 opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center text-gray-400 hover:text-red-500 transition-opacity"
          title="Delete"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Children + ephemeral add input */}
      {showChildArea && (
        <div className="pl-5 border-l border-gray-200 dark:border-gray-700 ml-[9px]">
          {expanded && node.children.map((child) =>
            hideCompleted && child.completed ? null : (
              <SubtaskItem
                key={child.id}
                node={child}
                depth={depth + 1}
                hideCompleted={hideCompleted}
                expandedIds={expandedIds}
                addingChildOf={addingChildOf}
                onToggleExpand={onToggleExpand}
                onToggle={onToggle}
                onRename={onRename}
                onDelete={onDelete}
                onCreate={onCreate}
                onStartAddChild={onStartAddChild}
              />
            )
          )}
          {isAddingChild && (
            <EphemeralInput
              onCommit={(title) => {
                onCreate(title, node.id);
                onStartAddChild(null);
              }}
              onDismiss={() => onStartAddChild(null)}
            />
          )}
        </div>
      )}
    </div>
  );
}

// --- EphemeralInput (appears on + click, auto-focused, dismisses on blur-empty) ---

interface EphemeralInputProps {
  onCommit: (title: string) => void;
  onDismiss: () => void;
}

function EphemeralInput({ onCommit, onDismiss }: EphemeralInputProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Use rAF to ensure DOM is painted before focusing
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const finish = () => {
    if (value.trim()) {
      onCommit(value.trim());
    } else {
      onDismiss();
    }
  };

  return (
    <div className="py-1">
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={finish}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); finish(); }
          if (e.key === 'Escape') { e.preventDefault(); onDismiss(); }
        }}
        placeholder="Sub-task title..."
        className="w-full text-sm bg-transparent border-b border-gray-300 dark:border-gray-600 outline-none text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 py-0.5 focus:border-indigo-500"
      />
    </div>
  );
}

// --- InlineAdd (root-level "+" link with click-to-activate) ---

interface InlineAddProps {
  onAdd: (title: string) => void;
  placeholder: string;
}

function InlineAdd({ onAdd, placeholder }: InlineAddProps) {
  const [active, setActive] = useState(false);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const open = () => {
    setActive(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const commit = () => {
    if (value.trim()) {
      onAdd(value.trim());
    }
    setValue('');
    setActive(false);
  };

  const cancel = () => {
    setValue('');
    setActive(false);
  };

  if (!active) {
    return (
      <button
        type="button"
        onClick={open}
        className="text-xs text-gray-400 dark:text-gray-500 hover:text-indigo-500 dark:hover:text-indigo-400 py-1"
      >
        + Add sub-task
      </button>
    );
  }

  return (
    <div className="py-1">
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') cancel();
        }}
        placeholder={placeholder}
        className="w-full text-sm bg-transparent border-b border-gray-300 dark:border-gray-600 outline-none text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 py-0.5 focus:border-indigo-500"
      />
    </div>
  );
}
