import { useState } from 'react';
import type { FileTreeNode } from '../../stores/fileStore.js';
import { cn } from '../../utils/cn.js';

interface FileExplorerProps {
  tree: FileTreeNode[];
  onFileSelect: (path: string) => void;
  activePath: string | null;
}

export default function FileExplorer({ tree, onFileSelect, activePath }: FileExplorerProps) {
  return (
    <div className="h-full overflow-y-auto border-r border-gray-200 bg-gray-50 text-sm">
      <div className="px-3 py-2 text-xs font-semibold uppercase text-gray-500 tracking-wider">
        Files
      </div>
      <div className="pb-4">
        {tree.map((node) => (
          <TreeNode
            key={node.path}
            node={node}
            depth={0}
            onFileSelect={onFileSelect}
            activePath={activePath}
          />
        ))}
      </div>
    </div>
  );
}

interface TreeNodeProps {
  node: FileTreeNode;
  depth: number;
  onFileSelect: (path: string) => void;
  activePath: string | null;
}

function TreeNode({ node, depth, onFileSelect, activePath }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < 1);
  const isActive = node.path === activePath;

  if (node.type === 'directory') {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className={cn(
            'flex w-full items-center gap-1 px-2 py-0.5 text-left hover:bg-gray-200/60 text-gray-700',
          )}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={cn('h-3 w-3 text-gray-400 transition-transform', expanded && 'rotate-90')}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
              clipRule="evenodd"
            />
          </svg>
          <span className="truncate">{node.name}</span>
        </button>
        {expanded && node.children?.map((child) => (
          <TreeNode
            key={child.path}
            node={child}
            depth={depth + 1}
            onFileSelect={onFileSelect}
            activePath={activePath}
          />
        ))}
      </div>
    );
  }

  return (
    <button
      onClick={() => onFileSelect(node.path)}
      className={cn(
        'flex w-full items-center gap-1 px-2 py-0.5 text-left hover:bg-gray-200/60',
        isActive ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-600',
      )}
      style={{ paddingLeft: `${depth * 12 + 20}px` }}
    >
      <span className="truncate">{node.name}</span>
    </button>
  );
}
