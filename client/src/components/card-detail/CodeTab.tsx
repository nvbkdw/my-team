import { useEffect } from 'react';
import { useFileStore } from '../../stores/fileStore.js';
import FileExplorer from './FileExplorer.js';
import MonacoEditorPanel from './MonacoEditorPanel.js';
import Spinner from '../ui/Spinner.js';

interface CodeTabProps {
  cardId: string;
  hasBranch: boolean;
}

export default function CodeTab({ cardId, hasBranch }: CodeTabProps) {
  const tree = useFileStore((s) => s.tree);
  const treeLoading = useFileStore((s) => s.treeLoading);
  const activeFilePath = useFileStore((s) => s.activeFilePath);
  const fetchTree = useFileStore((s) => s.fetchTree);
  const openFile = useFileStore((s) => s.openFile);

  useEffect(() => {
    if (hasBranch) {
      fetchTree(cardId);
    }
  }, [cardId, hasBranch, fetchTree]);

  if (!hasBranch) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-400">
        <div className="text-center">
          <p>No branch assigned to this card</p>
          <p className="text-xs mt-1">Create a branch in the Details tab first</p>
        </div>
      </div>
    );
  }

  if (treeLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div className="w-56 flex-shrink-0">
        <FileExplorer
          tree={tree}
          onFileSelect={(path) => openFile(cardId, path)}
          activePath={activeFilePath}
        />
      </div>
      <div className="flex-1">
        <MonacoEditorPanel cardId={cardId} />
      </div>
    </div>
  );
}
